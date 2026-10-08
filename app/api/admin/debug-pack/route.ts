import { NextResponse } from 'next/server'
import { getMLToken } from '@/lib/ml-auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const packId = searchParams.get('pack_id') || ''
    const orderNumber = searchParams.get('order_number') || ''

    const tokenResult = await getMLToken()
    if (!tokenResult?.token) {
      return NextResponse.json({ ok: false, error: 'token ML indisponível' }, { status: 500 })
    }

    let targetPack = packId
    if (!targetPack && orderNumber) {
      const order = await prisma.orders.findFirst({
        where: { order_number: orderNumber },
        select: { pack_id: true },
      })
      targetPack = order?.pack_id || ''
    }

    if (!targetPack) {
      return NextResponse.json({ ok: false, error: 'passa pack_id ou order_number' }, { status: 400 })
    }

    // Endpoints pra testar
    const endpoints: Record<string, string> = {
      pack: `https://api.mercadolibre.com/packs/${targetPack}?access_token=${tokenResult.token}`,
      pack_orders: `https://api.mercadolibre.com/packs/${targetPack}/orders?access_token=${tokenResult.token}`,
      order: orderNumber ? `https://api.mercadolibre.com/orders/${orderNumber}?access_token=${tokenResult.token}` : '',
      shipment_costs: `https://api.mercadolibre.com/shipments/47386829824/costs?access_token=${tokenResult.token}`,
      shipment_leads: `https://api.mercadolibre.com/shipments/47386829824/leads?access_token=${tokenResult.token}`,
      shipment: `https://api.mercadolibre.com/shipments/47386829824?access_token=${tokenResult.token}`,
    }

    const results: any = {}
    for (const [name, url] of Object.entries(endpoints)) {
      if (!url) continue
      try {
        const r = await fetch(url)
        const txt = await r.text()
        try { results[name] = { status: r.status, json: JSON.parse(txt) } }
        catch { results[name] = { status: r.status, text: txt.substring(0, 500) } }
      } catch (e: any) {
        results[name] = { error: e.message }
      }
    }

    return NextResponse.json({ ok: true, pack_id: targetPack, order_number: orderNumber, results })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}