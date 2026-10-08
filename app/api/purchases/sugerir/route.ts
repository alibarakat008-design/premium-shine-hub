/**
 * =====================================================
 * API: Sugestão de Pedido de Compra
 * =====================================================
 * GET /api/purchases/sugerir?dias_vendas=30&cobertura=45
 *
 * Analisa vendas recentes e sugere compras pra cobrir X dias
 * Retorna lista de produtos que precisam reposição com:
 *   - Qtd sugerida
 *   - Custo estimado
 *   - Fornecedor sugerido
 *
 * POST /api/purchases/sugerir/gerar
 *   Gera pedido de compra (supplier_purchases + items) no banco
 *   Body: { items: [{ product_id, quantidade }], supplier_id }
 * =====================================================
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const diasVendas = parseInt(searchParams.get('dias_vendas') || '30')
    const diasCobertura = parseInt(searchParams.get('cobertura') || '45')

    const from = new Date(Date.now() - diasVendas * 24 * 60 * 60 * 1000)

    // Buscar produtos com estoque baixo
    const produtosBaixos = await prisma.products.findMany({
      where: {
        ativo: true,
        inventory: {
          quantidade_atual: { lte: prisma.inventory.fields.quantidade_minima },
        },
      },
      include: {
        brands: { select: { nome: true } },
        categories: { select: { nome: true } },
        inventory: { select: { quantidade_atual: true, quantidade_minima: true, quantidade_maxima: true } },
        order_items: {
          where: { orders: { created_at: { gte: from } } },
          include: { orders: { select: { created_at: true } } },
        },
        product_prices: { where: { canal: 'mercado_livre' }, take: 1 },
        suppliers: { select: { id: true, nome: true, prazo_entrega_dias: true } },
      },
    })

    const sugestoes = produtosBaixos.map((p: any) => {
      // Calcular velocidade de vendas (un/dia)
      const qtdVendida = p.order_items.reduce((acc: number, item: any) => acc + Number(item.quantidade || 0), 0)
      const velocidadeDiaria = qtdVendida / diasVendas
      // Estoque atual
      const estoque = p.inventory?.quantidade_atual || 0
      const minimo = p.inventory?.quantidade_minima || 0
      const maximo = p.inventory?.quantidade_maxima || estoque * 4
      // Dias de estoque restantes
      const diasRestantes = velocidadeDiaria > 0 ? estoque / velocidadeDiaria : 999
      // Qtd pra comprar (cobrir `cobertura` dias)
      const qtdNecessaria = Math.max(0, Math.ceil(velocidadeDiaria * diasCobertura - estoque))
      // Custo estimado
      const custo = Number(p.product_prices?.[0]?.custo || 0)
      const custoTotal = custo * qtdNecessaria

      let urgencia: 'critica' | 'alta' | 'media' | 'baixa' = 'baixa'
      if (diasRestantes < 7) urgencia = 'critica'
      else if (diasRestantes < 15) urgencia = 'alta'
      else if (diasRestantes < 30) urgencia = 'media'

      return {
        product_id: p.id,
        sku: p.sku,
        nome: p.nome,
        marca: p.brands?.nome,
        categoria: p.categories?.nome,
        estoque_atual: estoque,
        estoque_minimo: minimo,
        estoque_maximo: maximo,
        velocidade_venda_diaria: Math.round(velocidadeDiaria * 100) / 100,
        dias_restantes: Math.round(diasRestantes),
        qtd_sugerida: qtdNecessaria,
        custo_unitario: custo,
        custo_total: Math.round(custoTotal * 100) / 100,
        urgencia,
        fornecedor_sugerido: p.suppliers,
      }
    })

    // Ordenar por urgência
    const ordemUrgencia: any = { critica: 0, alta: 1, media: 2, baixa: 3 }
    sugestoes.sort((a, b) => ordemUrgencia[a.urgencia] - ordemUrgencia[b.urgencia])

    // Total
    const custoTotalGeral = sugestoes.reduce((acc, s) => acc + s.custo_total, 0)

    // Fornecedores
    const fornecedoresIds = Array.from(new Set(sugestoes.filter(s => s.fornecedor_sugerido?.id).map(s => s.fornecedor_sugerido.id)))
    const fornecedores = await prisma.suppliers.findMany({
      where: { id: { in: fornecedoresIds } },
    })

    return NextResponse.json({
      success: true,
      data: {
        configuracao: { dias_vendas: diasVendas, dias_cobertura: diasCobertura, from: from.toISOString().substring(0, 10) },
        resumo: {
          total_produtos: sugestoes.length,
          critica: sugestoes.filter(s => s.urgencia === 'critica').length,
          alta: sugestoes.filter(s => s.urgencia === 'alta').length,
          media: sugestoes.filter(s => s.urgencia === 'media').length,
          baixa: sugestoes.filter(s => s.urgencia === 'baixa').length,
          custo_total_estimado: Math.round(custoTotalGeral * 100) / 100,
        },
        sugestoes,
        fornecedores,
      },
    })
  } catch (err: any) {
    console.error('[API Sugerir Compras]', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
