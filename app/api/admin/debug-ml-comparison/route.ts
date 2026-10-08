/**
 * Debug: compara DB vs ML API pra UMA venda específica.
 * GET /api/admin/debug-ml-comparison?order=2000017040593402&secret=LUXO2026
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || ''
  const { searchParams } = new URL(req.url)
  const secret = searchParams.get('secret')
  if (secret !== 'LUXO2026' && !authHeader.startsWith('Basic ')) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }
  const orderNumber = searchParams.get('order')
  if (!orderNumber) return NextResponse.json({ ok: false, error: 'order required' }, { status: 400 })

  try {
    const o = await prisma.orders.findFirst({ where: { order_number: orderNumber } })
    if (!o) return NextResponse.json({ ok: false, error: 'order not found' }, { status: 404 })

    const acc = await prisma.marketplace_accounts.findFirst({
      where: { plataforma: 'mercado_livre', ativa: true },
      orderBy: { updated_at: 'desc' },
    })
    if (!acc) return NextResponse.json({ ok: false, error: 'no ML account' }, { status: 404 })

    const r1 = await fetch(`https://api.mercadolibre.com/orders/${orderNumber}`, {
      headers: { Authorization: `Bearer ${acc.access_token}` },
    })
    if (!r1.ok) return NextResponse.json({ ok: false, error: `ML order ${r1.status}` }, { status: 500 })
    const mlOrder = await r1.json()

    const shippingId = mlOrder.shipping?.id
    let shipCosts = null
    let shipment = null
    if (shippingId) {
      const sr = await fetch(`https://api.mercadolibre.com/shipments/${shippingId}`, {
        headers: { Authorization: `Bearer ${acc.access_token}` },
      })
      if (sr.ok) shipment = await sr.json()
      const cr = await fetch(`https://api.mercadolibre.com/shipments/${shippingId}/costs`, {
        headers: { Authorization: `Bearer ${acc.access_token}` },
      })
      if (cr.ok) shipCosts = await cr.json()
    }

    return NextResponse.json({
      ok: true,
      db: {
        order_number: o.order_number,
        total: Number(o.total?.toString() ?? 0),
        subtotal: Number(o.subtotal?.toString() ?? 0),
        frete: Number(o.frete?.toString() ?? 0),
        comissao_seller: Number(o.comissao_seller_valor?.toString() ?? 0),
        bonus_envio: Number(o.bonus_envio_valor?.toString() ?? 0),
        bonus_cupom: Number(o.bonus_cupom_valor?.toString() ?? 0),
        tarifa_pct: Number(o.tarifa_pct_valor?.toString() ?? 0),
        tarifa_fixa: Number(o.tarifa_fixa_valor?.toString() ?? 0),
        recebimento: Number(o.recebimento_liquido?.toString() ?? 0),
        tipo_envio: o.tipo_envio,
      },
      ml_order: {
        total_amount: mlOrder.total_amount,
        order_items: mlOrder.order_items?.map((it: any) => ({
          sku: it.item?.seller_sku,
          title: it.item?.title,
          unit_price: it.unit_price,
          quantity: it.quantity,
          sale_fee: it.sale_fee,
        })),
        payments: mlOrder.payments?.map((p: any) => ({
          reason: p.reason,
          status: p.status,
          coupon_amount: p.coupon_amount,
          total_paid_amount: p.total_paid_amount,
        })),
        tags: mlOrder.tags,
      },
      shipment: shipment ? {
        logistic_type: shipment.logistic_type,
        mode: shipment.mode,
        status: shipment.status,
        base_cost: shipment.shipping_option?.cost,
        list_cost: shipment.shipping_option?.list_cost,
      } : null,
      costs: shipCosts ? {
        receiver_save: shipCosts.receiver?.save,
        senders: shipCosts.senders?.map((s: any) => ({
          save: s.save,
          cost: s.cost,
        })),
      } : null,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}