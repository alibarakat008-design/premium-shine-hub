import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// GET /api/admin/reconcile/check?order=2000017164631880
// Compara orders.recebimento_liquido com cálculo ML on-the-fly (sem salvar nada)
// Retorna { diff, ml_receb, db_receb, ml_venda, ml_sale_fee, sender_save, receiver_save, sender_cost, tipo_envio, has_discrepancy }

async function getMLToken() {
  const acc = await prisma.marketplace_accounts.findFirst({
    where: { plataforma: 'mercado_livre', ativa: true },
    orderBy: { updated_at: 'desc' },
  })
  return acc?.access_token
}

export async function GET(req: Request) {
  const t0 = Date.now()
  try {
    const { searchParams } = new URL(req.url)
    const orderNum = searchParams.get('order')
    if (!orderNum) return NextResponse.json({ ok: false, error: 'order required' }, { status: 400 })

    const o = await prisma.orders.findFirst({
      where: { order_number: orderNum },
      include: { order_items: true },
    })
    if (!o) return NextResponse.json({ ok: false, error: 'order not found' }, { status: 404 })

    const token = await getMLToken()
    if (!token) return NextResponse.json({ ok: false, error: 'no ML token' }, { status: 500 })

    const dec = (d: any) => (d ? Number(d.toString()) : 0)

    const mlResp = await fetch(`https://api.mercadolibre.com/orders/${orderNum}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!mlResp.ok) {
      return NextResponse.json({ ok: false, error: `ML ${mlResp.status}` }, { status: 502 })
    }
    const mlOrder: any = await mlResp.json()

    let shipCosts: any = { receiver: {}, senders: [{}] }
    let logisticType = o.tipo_envio || null
    if (mlOrder.shipping?.id) {
      try {
        const [cResp, sResp] = await Promise.all([
          fetch(`https://api.mercadolibre.com/shipments/${mlOrder.shipping.id}/costs`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`https://api.mercadolibre.com/shipments/${mlOrder.shipping.id}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ])
        if (cResp.ok) shipCosts = await cResp.json()
        if (sResp.ok) {
          const shipment: any = await sResp.json()
          logisticType = shipment.logistic_type || logisticType
        }
      } catch {}
    }

    const saleFee = mlOrder.sale_fee ? Number(mlOrder.sale_fee.toString?.() ?? mlOrder.sale_fee) : 0
    const mlVenda = mlOrder.total_amount ? Number(mlOrder.total_amount.toString?.() ?? mlOrder.total_amount) : dec(o.total)
    const subtotal = dec(o.subtotal)
    const senderCost = shipCosts?.senders?.[0]?.cost ? Number(shipCosts.senders[0].cost.toString?.() ?? shipCosts.senders[0].cost) : 0
    const senderSave = shipCosts?.senders?.[0]?.save ? Number(shipCosts.senders[0].save.toString?.() ?? shipCosts.senders[0].save) : 0
    const receiverSave = shipCosts?.receiver?.save ? Number(shipCosts.receiver.save.toString?.() ?? shipCosts.receiver.save) : 0

    let mlReceb = 0
    if (logisticType === 'self_service') {
      mlReceb = subtotal - saleFee + Math.max(senderSave, receiverSave)
    } else {
      mlReceb = mlVenda - saleFee - (logisticType === 'fulfillment' ? senderCost : 0) + senderSave + receiverSave
    }
    mlReceb = Number(mlReceb.toFixed(2))

    const dbReceb = dec(o.recebimento_liquido)
    const diff = Number((mlReceb - dbReceb).toFixed(2))

    return NextResponse.json({
      ok: true,
      elapsed_ms: Date.now() - t0,
      order_number: o.order_number,
      pack_id: o.pack_id,
      tipo_envio: logisticType,
      ml_receb: mlReceb,
      db_receb: dbReceb,
      diff,
      has_discrepancy: Math.abs(diff) > 1,
      ml_venda: mlVenda,
      ml_sale_fee: saleFee,
      ml_sender_save: senderSave,
      ml_receiver_save: receiverSave,
      ml_sender_cost: senderCost,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}