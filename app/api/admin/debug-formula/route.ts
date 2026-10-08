/**
 * Debug: valida fórmula de recebimento comparando DB vs ML
 * GET /api/admin/debug-formula?order=2000017469590010&company_id=e2633570-...
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

    // Pega DB
    const dbOrder: any[] = await prisma.$queryRawUnsafe(`
      SELECT order_number, total::float as total, frete::float as frete,
        bonus_envio_valor::float as bonus_envio, bonus_cupom_valor::float as bonus_cupom,
        recebimento_liquido::float as recebimento, comissao_seller_valor::float as comissao_total,
        tarifa_pct_valor::float as tarifa_pct, tarifa_fixa_valor::float as tarifa_fixa,
        tipo_envio
      FROM orders WHERE order_number = $1 AND company_id = $2::uuid
    `, orderId, companyId)
    const db = dbOrder[0] || null

    // ML
    const orderR = await fetch(`https://api.mercadolibre.com/orders/${orderId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!orderR.ok) return NextResponse.json({ ok: false, error: `ML order ${orderR.status}` }, { status: 502 })
    const order = await orderR.json()

    const shipR = await fetch(`https://api.mercadolibre.com/shipments/${order.shipping.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const ship = shipR.ok ? await shipR.json() : null

    const costsR = await fetch(`https://api.mercadolibre.com/shipments/${order.shipping.id}/costs`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const costs = costsR.ok ? await costsR.json() : null

    const venda = Number(order.total_amount)
    const comissaoPct = Math.round(venda * 0.12 * 100) / 100
    const senderCost = costs?.senders?.[0]?.cost || 0
    const senderSave = costs?.senders?.[0]?.save || 0
    const baseList = (ship?.base_cost || 0) - (ship?.shipping_option?.list_cost || 0)

    return NextResponse.json({
      ok: true,
      db,
      ml: {
        order: { id: order.id, total_amount: order.total_amount, shipping_id: order.shipping?.id },
        shipment_base_cost: ship?.base_cost,
        shipment_list_cost: ship?.shipping_option?.list_cost,
        sender_cost: costs?.senders?.[0]?.cost,
        sender_save: costs?.senders?.[0]?.save,
        receiver_cost: costs?.receiver?.cost,
        receiver_save: costs?.receiver?.save,
        base_menos_list: baseList,
      },
      calculos: {
        f1_venda_menos_comissao_menos_frete: Math.round((venda - comissaoPct - senderCost) * 100) / 100,
        f2_venda_menos_comissao_menos_frete_mais_sender_save: Math.round((venda - comissaoPct - senderCost + senderSave) * 100) / 100,
        f3_venda_menos_comissao_menos_frete_mais_base_menos_list: Math.round((venda - comissaoPct - senderCost + baseList) * 100) / 100,
        recebimento_no_db: db?.recebimento,
      },
      formula_correta: 'PRECISA VALIDAR',
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}
