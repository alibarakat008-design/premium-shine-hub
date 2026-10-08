// /app/api/admin/produtos-all/route.ts
// Retorna TODOS os produtos com estoque/valor — via Prisma (sem Management API)
// GET (sem params) → todos os produtos de todas as marcas
// GET ?marca_id=X → produtos de uma marca específica
// GET ?faltam=1 → só produtos SEM listing no ML
import { NextRequest, NextResponse } from 'next/server'
import { isMatrizRequest } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const LIURA_ID = 'e2633570-74da-4b14-9ca1-ba7b0670e612'

export async function GET(req: NextRequest) {
  if (!isMatrizRequest(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const marcaId = searchParams.get('marca_id')
    const faltamOnly = searchParams.get('faltam') === '1'

    // Buscar account IDs da LIURA primeiro
    const accounts = await prisma.marketplace_accounts.findMany({
      where: { company_id: LIURA_ID },
      select: { id: true },
    })
    const accountIds = accounts.map(a => a.id)

    // Buscar todos os produtos com os relacionamentos
    const products = await prisma.products.findMany({
      where: {
        ...(marcaId && marcaId !== 'TUDO' ? { marca_id: marcaId } : {}),
      },
      include: {
        brands: { select: { id: true, nome: true } },
        product_prices: {
          where: { company_id: LIURA_ID },
          select: { custo: true, preco_venda: true },
        },
        inventory: {
          select: { quantidade_atual: true },
        },
        marketplace_listings: {
          where: { account_id: { in: accountIds } },
          select: { id: true, permalink: true, listing_id: true },
          orderBy: { id: 'asc' },
        },
      },
      orderBy: [
        { brands: { nome: 'asc' } },
        { nome: 'asc' },
      ],
    })

    // Stats de estoque total
    // faltamOnly: products sem listing da LIURA (marketplace_listings.length === 0 no resultado filtrado)
    const filteredProducts = faltamOnly
      ? products.filter(p => p.marketplace_listings.length === 0)
      : products

    const totalEstoqueQtd = filteredProducts.reduce((a, p) => a + (p.inventory?.quantidade_atual ?? 0), 0)
    const totalEstoqueValor = filteredProducts.reduce((a, p) => {
      const custo = p.product_prices[0]?.custo ?? 0
      return a + (p.inventory?.quantidade_atual ?? 0) * Number(custo)
    }, 0)

    const produtos = filteredProducts.map(p => {
      let olfativa = ''
      try {
        const notas = p.notas_olfativas as any
        if (notas) {
          if (Array.isArray(notas)) olfativa = notas.join(' / ')
          else if (typeof notas === 'string') olfativa = notas
          else if (notas.familia) olfativa = notas.familia
          else if (notas.tipo) olfativa = notas.tipo
          else if (notas.descricao) olfativa = notas.descricao
        }
      } catch {}

      const price = p.product_prices[0]
      const primeiroListing = p.marketplace_listings[0]

      return {
        product_id: p.id,
        sku: p.sku,
        nome: p.nome,
        ean: p.ean || null,
        volume: p.volume || null,
        foto: p.foto_principal_url || null,
        link_ml: primeiroListing?.permalink || null,
        ativo: p.ativo !== false,
        destaque: p.destaque || false,
        publicado_site: p.publicado_site || false,
        publicado_shopee: p.publicado_shopee || false,
        marca_nome: p.brands?.nome || null,
        marca_id: p.brands?.id || null,
        custo: price ? Number(price.custo ?? 0) : 0,
        preco_venda: price ? Number(price.preco_venda ?? 0) : 0,
        estoque: p.inventory?.quantidade_atual ?? 0,
        listings_count: p.marketplace_listings.length,
        anunciado: p.marketplace_listings.length > 0,
        olfativa,
      }
    })

    return NextResponse.json({
      ok: true,
      total: produtos.length,
      total_estoque_qtd: totalEstoqueQtd,
      total_estoque_valor: totalEstoqueValor,
      total_anunciados: produtos.filter(p => p.anunciado).length,
      total_faltam: produtos.filter(p => !p.anunciado).length,
      custo_label: 'LIURA',
      custo_markup: 1.0,
      produtos,
    })
  } catch (err: any) {
    console.error('[produtos-all]', err)
    return NextResponse.json({ ok: false, error: err.message?.substring(0, 500) }, { status: 500 })
  }
}
