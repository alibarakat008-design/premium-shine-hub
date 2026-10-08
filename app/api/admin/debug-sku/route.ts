import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || ''
  const { searchParams } = new URL(req.url)
  const secret = searchParams.get('secret')
  if (secret !== 'LUXO2026' && !authHeader.startsWith('Basic ')) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const sku = searchParams.get('sku') || 'MLB4473564109'

  const produto = await prisma.products.findFirst({
    where: { sku },
    include: {
      product_prices: { where: { canal: 'mercado_livre' } },
      marketplace_listings: { select: { listing_id: true, account_id: true } },
    },
  })

  const listing = await prisma.marketplace_listings.findFirst({
    where: { listing_id: sku },
    include: { products: { select: { id: true, sku: true, nome: true } } },
  })

  const orderItemsSemLink = await prisma.order_items.findMany({
    where: { sku, product_id: null },
    take: 5,
    select: { id: true, sku: true, order_id: true },
  })

  return NextResponse.json({
    ok: true,
    sku,
    produto_encontrado: produto
      ? { id: produto.id, sku: produto.sku, custo: produto.product_prices?.[0]?.custo, listings_count: produto.marketplace_listings?.length }
      : null,
    listing_encontrado: listing
      ? { listing_id: listing.listing_id, product_id: listing.product_id, produto_vinculado: listing.products }
      : null,
    order_items_sem_link_count: orderItemsSemLink.length,
    exemplos: orderItemsSemLink,
  })
}