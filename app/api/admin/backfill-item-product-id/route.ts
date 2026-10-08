/**
 * Backfill de order_items.product_id via lookup em marketplace_listings.listing_id
 * Resolve o problema: custo não aparece nas vendas porque product_id está NULL
 *
 * GET /api/admin/backfill-item-product-id?secret=LUXO2026&dias=30&limit=200
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const secret = searchParams.get('secret')
  const authHeader = req.headers.get('authorization') || ''
  const isBasicAuth = authHeader.startsWith('Basic ')
  if (secret !== 'LUXO2026' && !isBasicAuth) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const dias = parseInt(searchParams.get('dias') || '30', 10)
  const limit = parseInt(searchParams.get('limit') || '500', 10)
  const dataLimite = new Date(Date.now() - dias * 24 * 3600 * 1000)

  // Busca items sem product_id
  const items = await prisma.order_items.findMany({
    where: {
      product_id: null,
      orders: {
        created_at: { gte: dataLimite },
        origem: 'mercado_livre',
      },
    },
    take: limit,
    select: {
      id: true,
      sku: true,
      order_id: true,
    },
  })

  if (items.length === 0) {
    return NextResponse.json({
      ok: true,
      total_processados: 0,
      atualizados: 0,
      message: 'Nada a processar',
    })
  }

  // Estratégia: usar SKU pra encontrar products
  // SKU no item pode ser:
  // - "MLBxxxxxxx" (ML puro) → precisa adicionar "ML-" prefix
  // - "ML-MLBxxxxxxx" (com prefixo) → match direto
  // - SKU interno do seller
  const skus = [...new Set(items.map((it) => it.sku).filter(Boolean))]
  const skusWithPrefix = skus.map((s) => (s.startsWith('ML-') ? s : `ML-${s}`))

  // 1) Tenta match direto com products.sku
  const productsByExact = await prisma.products.findMany({
    where: { sku: { in: skus } },
    select: { id: true, sku: true },
  })
  const productMap = new Map<string, string>() // sku -> product_id
  for (const p of productsByExact) productMap.set(p.sku, p.id)

  // 2) Tenta match com products.sku IN (skus com prefixo ML-)
  if (productMap.size < skus.length) {
    const remainingSkus = skus.filter((s) => !productMap.has(s))
    const remainingWithPrefix = remainingSkus.map((s) => (s.startsWith('ML-') ? s : `ML-${s}`))
    const productsWithPrefix = await prisma.products.findMany({
      where: { sku: { in: remainingWithPrefix } },
      select: { id: true, sku: true },
    })
    // Mapear de volta: products.sku com prefixo -> order_items.sku sem prefixo
    for (const p of productsWithPrefix) {
      const skuSemPrefix = p.sku.startsWith('ML-') ? p.sku.slice(3) : p.sku
      productMap.set(skuSemPrefix, p.id)
      productMap.set(p.sku, p.id)
    }
  }

  // 3) Tenta match via marketplace_listings.listing_id (caso SKU seja MLBxxxx)
  const skusRestantes = skus.filter((s) => !productMap.has(s))
  if (skusRestantes.length > 0) {
    const listings = await prisma.marketplace_listings.findMany({
      where: { listing_id: { in: skusRestantes.filter((s) => s.startsWith('MLB')) } },
      select: { listing_id: true, product_id: true },
    })
    for (const l of listings) productMap.set(l.listing_id, l.product_id)
  }

  let atualizados = 0
  let naoEncontrados = 0
  const detalhe: any[] = []

  for (const it of items) {
    const productId = productMap.get(it.sku)
    if (!productId) {
      naoEncontrados++
      continue
    }

    await prisma.order_items.update({
      where: { id: it.id },
      data: { product_id: productId },
    })
    atualizados++
    detalhe.push({ sku: it.sku, product_id: productId })
  }

  return NextResponse.json({
    ok: true,
    total_processados: items.length,
    atualizados,
    nao_encontrados: naoEncontrados,
    amostra: detalhe.slice(0, 10),
  })
}