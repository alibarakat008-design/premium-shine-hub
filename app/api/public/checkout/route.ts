/**
 * =====================================================
 * API PÚBLICA — Para site premiumshine.com.br
 * Premium Shine Hub
 * =====================================================
 * Endpoints que o site EXTERNO consome via JavaScript:
 *   GET  /api/public/catalogo       — Lista produtos ativos
 *   GET  /api/public/produto/:id    — Detalhe de 1 produto
 *   POST /api/public/checkout       — Criar pedido + enviar pro ML/Shopee
 *   GET  /api/public/pedido/:id     — Status do pedido
 *
 * Autenticação: API Key no header X-API-Key
 * CORS: configurado pra aceitar premiumshine.com.br
 * =====================================================
 */

// =====================================================
// GET /api/public/catalogo
// =====================================================
// app/api/public/catalogo/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey } from '@/lib/integracao-site/config'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    // Validar API Key
    const auth = await validateApiKey(request)
    if (!auth.valid) {
      return NextResponse.json({ error: auth.error }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const marca = searchParams.get('marca')
    const categoria = searchParams.get('categoria')
    const genero = searchParams.get('genero')
    const busca = searchParams.get('q')
    const limite = Number(searchParams.get('limite') || 50)
    const pagina = Number(searchParams.get('pagina') || 1)

    // Buscar produtos ativos com preço do canal site_b2c
    const where: any = { ativo: true }

    if (marca) where.marca = { nome: marca }
    if (categoria) where.categoria = { slug: categoria }
    if (genero) where.genero = genero
    if (busca) {
      where.OR = [
        { nome: { contains: busca, mode: 'insensitive' } },
        { sku: { contains: busca, mode: 'insensitive' } },
        { ean: { contains: busca } },
      ]
    }

    const produtos = await prisma.products.findMany({
      where,
      include: {
        brands: { select: { nome: true, is_marca_propria: true } },
        categories: { select: { nome: true, slug: true } },
        product_prices: {
          where: { canal: 'site_b2c' },
          select: { preco_venda: true, preco_promocional: true, preco_dinamico_ativo: true },
        },
        inventory: { select: { quantidade_atual: true } },
        // notas_olfativas: true, // Json field, não precisa incluir
      },
      take: limite,
      skip: (pagina - 1) * limite,
      orderBy: { nome: 'asc' },
    })

    // Formatar resposta otimizada pro site
    const resultado = produtos.map((p) => {
      const preco = p.product_prices[0]
      const emEstoque = (p.inventory?.quantidade_atual || 0) > 0

      return {
        id: p.id,
        sku: p.sku,
        ean: p.ean,
        nome: p.nome,
        slug: p.sku.toLowerCase().replace(/[^a-z0-9]/g, '-'),
        marca: p.brands.nome,
        marca_propria: p.brands.is_marca_propria,
        categoria: p.categories?.slug,
        volume: p.volume,
        genero: p.genero,
        foto: p.foto_principal_url,
        fotos: p.fotos_adicionais || [],
        preco: preco ? Number(preco.preco_venda) : null,
        preco_promocional: preco?.preco_promocional ? Number(preco.preco_promocional) : null,
        em_estoque: emEstoque,
        em_destaque: p.destaque,
        // Notas olfativas (campo Json)
        notas: p.notas_olfativas as any,
      }
    })

    return NextResponse.json({
      success: true,
      data: resultado,
      meta: {
        pagina,
        limite,
        total: await prisma.products.count({ where }),
      },
    })
  } catch (err: any) {
    console.error('[API Public Catalogo]', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

// =====================================================
// POST /api/public/checkout
// =====================================================
// app/api/public/checkout/route.ts

import { z } from 'zod'

export const dynamic = 'force-dynamic'

const CheckoutSchema = z.object({
  cliente: z.object({
    nome: z.string().min(3),
    email: z.string().email(),
    telefone: z.string().min(10),
    cpf: z.string().min(11).optional(),
  }),
  itens: z.array(z.object({
    sku: z.string(),
    quantidade: z.number().int().min(1).max(100),
  })).min(1),
  endereco: z.object({
    cep: z.string(),
    logradouro: z.string(),
    numero: z.string(),
    complemento: z.string().optional(),
    bairro: z.string(),
    cidade: z.string(),
    estado: z.string().length(2),
  }),
  embalagem_id: z.string().uuid().optional(),
  observacao: z.string().optional(),
})

export async function POST(request: NextRequest) {

  try {
    const auth = await validateApiKey(request)
    if (!auth.valid) {
      return NextResponse.json({ error: auth.error }, { status: 401 })
    }

    const body = await request.json()
    const data = CheckoutSchema.parse(body)

    // 1) Calcular valores
    let subtotal = 0
    const itensCompletos: any[] = []
    let embalagem = 0

    for (const item of data.itens) {
      const produto = await prisma.products.findFirst({
        where: { sku: item.sku, ativo: true },
        include: {
          product_prices: { where: { canal: 'site_b2c' } },
          inventory: true,
        },
      })

      if (!produto) {
        return NextResponse.json({ error: `Produto ${item.sku} não encontrado` }, { status: 400 })
      }

      if (!produto.inventory || produto.inventory.quantidade_atual < item.quantidade) {
        return NextResponse.json(
          { error: `${produto.nome} sem estoque suficiente (disponível: ${produto.inventory?.quantidade_atual || 0})` },
          { status: 400 }
        )
      }

      const preco = produto.product_prices[0]?.preco_venda
      if (!preco) {
        return NextResponse.json({ error: `${produto.nome} sem preço cadastrado` }, { status: 400 })
      }

      const itemTotal = Number(preco) * item.quantidade
      subtotal += itemTotal

      itensCompletos.push({
        product_id: produto.id,
        sku: produto.sku,
        nome_produto: produto.nome,
        foto_url: produto.foto_principal_url,
        quantidade: item.quantidade,
        preco_unitario: Number(preco),
        preco_total: itemTotal,
        custo_unitario: produto.inventory.custo_medio || Number(preco) * 0.55,
      })
    }

    // 2) Calcular embalagem premium (se solicitada)
    if (data.embalagem_id) {
      const emb = await prisma.packaging_options.findUnique({
        where: { id: data.embalagem_id },
      })
      if (emb && emb.ativo) {
        embalagem = Number(emb.preco_cliente)
      }
    }

    // 3) Calcular frete (aqui você integra com sua logística)
    // Por enquanto, frete fixo por estado
    const frete = calcularFrete(data.endereco.estado, subtotal)

    // 4) Criar ou encontrar cliente
    let customer = await prisma.customers.findFirst({
      where: { email: data.cliente.email.toLowerCase() },
    })
    if (customer) {
      customer = await prisma.customers.update({
        where: { id: customer.id },
        data: {
          nome: data.cliente.nome,
          telefone: data.cliente.telefone,
          cpf: data.cliente.cpf,
          endereco_padrao: data.endereco,
        },
      })
    } else {
      customer = await prisma.customers.create({
        data: {
          nome: data.cliente.nome,
          email: data.cliente.email.toLowerCase(),
          telefone: data.cliente.telefone,
          cpf: data.cliente.cpf,
          endereco_padrao: data.endereco,
          consentimento_marketing: false,
        },
      })
    }

    // 5) Criar pedido
    const total = subtotal + embalagem + frete
    const custoTotal = itensCompletos.reduce((acc, i) => acc + i.custo_unitario * i.quantidade, 0)
    const lucroBruto = total - custoTotal
    // Taxa fixa estimada de gateway + impostos
    const lucroLiquido = lucroBruto - (total * 0.10) - (total * 0.08)

    const order = await prisma.orders.create({
      data: {
        order_number: `SITE-${Date.now()}`,
        origem: 'site_b2c',
        company_id: auth.accountId || '',
        customer_id: customer.id,
        status: 'pendente',
        subtotal,
        frete,
        embalagem,
        total,
        custo_total: custoTotal,
        lucro_bruto: lucroBruto,
        lucro_liquido: lucroLiquido,
        endereco_entrega: data.endereco,
        forma_pagamento: 'Mercado Pago (pendente)',
        payment_id: null,
        order_items: { create: itensCompletos },
      },
      include: { order_items: true },
    })

    return NextResponse.json({
      success: true,
      data: {
        order_id: order.id,
        order_number: order.order_number,
        total,
        proximo_passo: 'redirecionar_para_pagamento',
        payment_url: `/api/public/payment/${order.id}`, // URL do Mercado Pago
      },
    })
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Dados inválidos', details: err.errors }, { status: 400 })
    }
    console.error('[API Public Checkout]', err)
    return NextResponse.json({ error: 'Erro ao processar pedido' }, { status: 500 })
  }
}

function calcularFrete(estado: string, subtotal: number): number {
  // Frete grátis acima de R$ 150
  if (subtotal >= 150) return 0
  // Frete fixo por região
  const tabela: Record<string, number> = {
    SP: 15, RJ: 22, MG: 25, ES: 25,
    PR: 28, SC: 30, RS: 35,
    BA: 35, PE: 38, CE: 42, RN: 45, PB: 42, AL: 45, SE: 42, MA: 48, PI: 48,
    GO: 28, DF: 28, MT: 38, MS: 35,
    PA: 50, AP: 65, AM: 55, RR: 65, AC: 60, RO: 55, TO: 45,
  }
  return tabela[estado] || 35
}
