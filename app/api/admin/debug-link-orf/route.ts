// Debug: pra uma venda órfã, ver o que vem do ML vs o que tem em marketplace_listings
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getMLToken } from '@/lib/ml-auth-multi'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

const BASIC = 'Basic ' + Buffer.from('premium:shine2026').toString('base64')

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== BASIC) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }
  const { searchParams } = new URL(req.url)
  const orderId = searchParams.get('order') || '2000017513749482'
  const companyId = searchParams.get('company_id') || 'e2633570-74da-4b14-9ca1-ba7b0670e612'

  try {
    const acc = await prisma.marketplace_accounts.findFirst({
      where: { company_id: companyId, plataforma: 'mercado_livre' },
    })
    const tokenRes = await getMLToken(companyId)
    const token = tokenRes.token

    // Busca venda no ML
    const orderR = await fetch(`https://api.mercadolibre.com/orders/${orderId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!orderR.ok) {
      return NextResponse.json({ ok: false, error: `ML ${orderR.status}` })
    }
    const order: any = await orderR.json()
    const mlItemIds = (order.order_items || []).map((i: any) => ({
      id: i.item?.id,
      sku: i.item?.seller_custom_field,
      title: i.item?.title,
    }))

    // Pra cada mlItemId, procura no marketplace_listings
    const listings: any[] = []
    for (const i of mlItemIds) {
      if (!i.id) continue
      const lst = await prisma.marketplace_listings.findFirst({
        where: { listing_id: String(i.id), account_id: acc.id },
        select: { listing_id: true, product_id: true },
      })
      listings.push({
        ml_id: i.id,
        ml_sku: i.sku,
        ml_title: i.title?.slice(0, 60),
        found_in_listings: !!lst,
        product_id: lst?.product_id || null,
      })
    }

    // Conta total de listings
    const totalListings: any[] = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*)::int as total FROM marketplace_listings WHERE account_id = $1::uuid
    `, acc.id)

    return NextResponse.json({
      ok: true,
      order_id: orderId,
      ml_items: mlItemIds,
      listings_check: listings,
      total_marketplace_listings: totalListings[0]?.total,
      insight: listings.every((l: any) => !l.found_in_listings)
        ? 'NENHUM listing_id bate com marketplace_listings — o sync-products-listing nunca rodou pra LIURA ou os IDs são diferentes'
        : `${listings.filter((l: any) => l.found_in_listings).length} de ${listings.length} encontrados`,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message })
  } finally {
    await prisma.$disconnect()
  }
}
