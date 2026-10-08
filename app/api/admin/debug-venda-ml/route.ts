/**
 * Debug: consulta ML uma venda específica pra ver o que tá no shipment
 * GET /api/admin/debug-venda-ml?order=2000017469590010&company_id=e2633570-...
 */
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
  const orderId = searchParams.get('order') || ''
  const companyId = searchParams.get('company_id') || 'e2633570-74da-4b14-9ca1-ba7b0670e612'
  if (!orderId) return NextResponse.json({ ok: false, error: 'Passe ?order=...' }, { status: 400 })

  try {
    const tokenRes = await getMLToken(companyId)
    if (!tokenRes?.token) return NextResponse.json({ ok: false, error: 'Sem token' }, { status: 401 })
    const token = tokenRes.token

    // Pega DB data
    const dbOrder: any[] = await prisma.$queryRawUnsafe(`
      SELECT order_number, status, total::float, comissao_seller_valor::float as comissao_total,
        tarifa_pct_valor::float as tarifa_pct, tarifa_fixa_valor::float as tarifa_fixa,
        frete::float as frete, bonus_envio_valor::float as bonus_envio,
        bonus_cupom_valor::float as bonus_cupom, recebimento_liquido::float as recebimento,
        tipo_envio
      FROM orders WHERE order_number = $1 AND company_id = $2::uuid
    `, orderId, companyId)
    const db = dbOrder[0] || null

    // Pega ML data
    const orderR = await fetch(`https://api.mercadolibre.com/orders/${orderId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!orderR.ok) return NextResponse.json({ ok: false, error: `ML order ${orderR.status}` }, { status: 502 })
    const order = await orderR.json()

    const shipR = await fetch(`https://api.mercadolibre.com/shipments/${order.shipping?.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const ship = shipR.ok ? await shipR.json() : null

    const costsR = await fetch(`https://api.mercadolibre.com/shipments/${order.shipping?.id}/costs`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const costs = costsR.ok ? await costsR.json() : null

    return NextResponse.json({
      ok: true,
      db,
      ml: {
        order: {
          id: order.id,
          status: order.status,
          total_amount: order.total_amount,
          date_created: order.date_created,
          shipping_id: order.shipping?.id,
        },
        shipment: ship ? {
          status: ship.status,
          logistic_type: ship.logistic_type,
          base_cost: ship.base_cost,
          list_cost: ship.shipping_option?.list_cost,
          sender_save: ship.sender_save,
          receiver_save: ship.receiver_save,
        } : null,
        costs: costs,
        order_items: (order.order_items || []).map((i: any) => ({
          title: i.item?.title,
          unit_price: i.unit_price,
          quantity: i.quantity,
          sale_fee: i.sale_fee,
        })),
        payments: (order.payments || []).map((p: any) => ({
          total_paid_amount: p.total_paid_amount,
          transaction_amount: p.transaction_amount,
          coupon_amount: p.coupon_amount,
        })),
      },
      // Cálculos pra comparar
      calculos: {
        // Fórmula canônica: recebimento = venda - comissao_pct - sender.cost + bonus_envio
        // sender.cost = costs.senders[0].cost
        // bonus_envio correto = max(base_cost - list_cost, sender_save, receiver_save) — mas isso tá errado!
        // O user diz: bonus_envio = 0 em cross_docking pra vendedor (sender.cost é tudo que ele paga)
        canonicamente_correto: db && costs ? {
          recebimento_esperado: (db.total - (costs.senders?.[0]?.cost || 0) * 0 - (12/100 * db.total) - (costs.senders?.[0]?.cost || 0)),
          // sender.cost:
          sender_cost: costs.senders?.[0]?.cost,
          // comissao pct (12%):
          comissao_pct: Math.round(db.total * 0.12 * 100) / 100,
        } : null,
      },
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}
