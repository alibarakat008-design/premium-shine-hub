import { NextResponse } from 'next/server'
import { getMLToken } from '@/lib/ml-auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const orderNumber = searchParams.get('order_number') || ''

    const tokenResult = await getMLToken()
    if (!tokenResult?.token) {
      return NextResponse.json({ ok: false, error: 'token ML indisponível' }, { status: 500 })
    }

    // pega o order pra achar o shipment_id
    const r = await fetch(`https://api.mercadolibre.com/orders/${orderNumber}?access_token=${tokenResult.token}`)
    const mlOrder = await r.json()
    const shippingId = mlOrder.shipping?.id

    const results: any = { order_id: orderNumber, shipping_id: shippingId }

    if (shippingId) {
      const endpoints = [
        `shipments/${shippingId}`,
        `shipments/${shippingId}/costs`,
        `shipments/${shippingId}/payments`,
        `shipments/${shippingId}/receipts`,
        `shipments/${shippingId}/billing`,
        `shipments/${shippingId}/sla`,
      ]
      for (const ep of endpoints) {
        try {
          const r2 = await fetch(`https://api.mercadolibre.com/${ep}?access_token=${tokenResult.token}`)
          const txt = await r2.text()
          try { results[ep] = { status: r2.status, json: JSON.parse(txt) } }
          catch { results[ep] = { status: r2.status, text: txt.substring(0, 300) } }
        } catch (e: any) {
          results[ep] = { error: e.message }
        }
      }
    }

    return NextResponse.json({ ok: true, results })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}