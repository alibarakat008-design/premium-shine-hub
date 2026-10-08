// Endpoint pra atualizar envio_full de cada listing via API ML
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

async function mlFetch(token: string, url: string) {
  const res = await fetch(`https://api.mercadolibre.com${url}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return res.json()
}

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const maxListings = Number(searchParams.get('max') || 30)
    const offset = Number(searchParams.get('offset') || 0)

    const account = await prisma.marketplace_accounts.findFirst({
      where: { nickname: 'LIURAESSENCE' },
    })
    if (!account) return NextResponse.json({ ok: false, error: 'Conta não encontrada' }, { status: 404 })
    const token = account.access_token!

    const listings = await prisma.marketplace_listings.findMany({
      take: maxListings,
      skip: offset,
      orderBy: { id: 'asc' },
    })

    let updated = 0
    let skipped = 0
    const results: any[] = []

    for (const l of listings) {
      try {
        const item = await mlFetch(token, `/items/${l.listing_id}`)
        const isFull = item.shipping?.logistic_type === 'fulfillment'
        await prisma.marketplace_listings.update({
          where: { id: l.id },
          data: {
            envio_full: isFull,
            stock_disponivel_ml: item.available_quantity || 0,
            vendas_total: item.sold_quantity || 0,
          },
        })
        results.push({ id: l.listing_id, envio_full: isFull, stock: item.available_quantity, sold: item.sold_quantity })
        if (isFull) updated++
      } catch (err: any) {
        skipped++
        results.push({ id: l.listing_id, error: err.message?.slice(0, 100) })
      }
    }

    return NextResponse.json({
      ok: true,
      processed: listings.length,
      updated_full: updated,
      skipped,
      next_offset: offset + maxListings,
      sample: results.slice(0, 5),
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
