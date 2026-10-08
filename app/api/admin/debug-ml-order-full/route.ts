import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

async function getMLToken() {
  const acc = await prisma.marketplace_accounts.findFirst({
    where: { plataforma: 'mercado_livre', ativa: true },
    orderBy: { updated_at: 'desc' },
  })
  return acc?.access_token
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const orderId = url.searchParams.get('orderId') || ''
    if (!orderId) return NextResponse.json({ error: 'orderId required' }, { status: 400 })

    const token = await getMLToken()
    if (!token) return NextResponse.json({ error: 'no token' }, { status: 500 })

    // 1. Get order
    const oResp = await fetch(`https://api.mercadolibre.com/orders/${orderId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const oText = await oResp.text()
    let oData: any
    try { oData = JSON.parse(oText) } catch { oData = { _raw: oText } }
    if (!oResp.ok) {
      return NextResponse.json({ error: 'order fetch failed', status: oResp.status, body: oData }, { status: oResp.status })
    }

    const shipId = oData.shipping?.id
    let shipment: any = null
    let shipmentCosts: any = null
    let payments: any = null
    if (shipId) {
      const sResp = await fetch(`https://api.mercadolibre.com/shipments/${shipId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const sText = await sResp.text()
      try { shipment = JSON.parse(sText) } catch { shipment = { _raw: sText } }

      const cResp = await fetch(`https://api.mercadolibre.com/shipments/${shipId}/costs`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const cText = await cResp.text()
      try { shipmentCosts = JSON.parse(cText) } catch { shipmentCosts = { _raw: cText } }
    }
    const pResp = await fetch(`https://api.mercadolibre.com/orders/${orderId}/payments`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const pText = await pResp.text()
    try { payments = JSON.parse(pText) } catch { payments = { _raw: pText } }

    return NextResponse.json({
      order: {
        id: oData.id,
        status: oData.status,
        shipping_id: shipId,
        logistic_type: shipment?.logistic_type,
        shipping_mode: shipment?.mode,
        shipping_status: shipment?.status,
        buyer_cost: oData.shipping?.buyer_cost,
        receiver_cost: shipmentCosts?.receiver?.cost,
        sender_cost: shipmentCosts?.senders?.[0]?.cost,
        receiver_save: shipmentCosts?.receiver?.save,
        sender_save: shipmentCosts?.senders?.[0]?.save,
        base_cost: shipment?.shipping_option?.base_cost,
        list_cost: shipment?.shipping_option?.list_cost,
        sale_fee: oData.order_items?.[0]?.sale_fee,
        total_amount: oData.total_amount,
        transaction_amount: payments?.[0]?.transaction_amount,
        total_paid_amount: payments?.[0]?.total_paid_amount,
        currency_id: payments?.[0]?.currency_id,
      },
      full_shipment: shipment,
      full_shipment_costs: shipmentCosts,
      full_payments: payments,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}