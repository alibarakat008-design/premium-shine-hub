import { NextResponse } from 'next/server'
import { getMLToken } from '@/lib/ml-auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * Pega 1 order do banco e mostra o JSON COMPLETO do ML
 * pra entender onde tá o frete
 * GET /api/admin/debug-ml-order?order_number=2000016217770234
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const orderNumber = searchParams.get('order_number') || ''

    const tokenResult = await getMLToken()
    if (!tokenResult?.token) {
      return NextResponse.json({ ok: false, error: 'token ML indisponível' }, { status: 500 })
    }

    // Se não passou order_number, pega a primeira do banco
    let target = orderNumber
    if (!target) {
      const orders = await prisma.orders.findMany({
        where: { origem: 'mercado_livre' },
        select: { order_number: true, total: true, comissao_seller_valor: true, frete: true, recebimento_liquido: true, created_at: true },
        orderBy: { total: 'desc' },
        take: 5,
      })
      return NextResponse.json({
        ok: true,
        banco_top5_por_total: orders,
        mensagem: 'passe ?order_number= pra inspecionar uma específica',
      })
    }

    const url = `https://api.mercadolibre.com/orders/${target}?access_token=${tokenResult.token}`
    const r = await fetch(url)
    const j = await r.json()

    // Tenta buscar info adicional do payment + shipment
    const paymentId = j?.payments?.[0]?.id
    let paymentDetail: any = null
    let shipmentDetail: any = null
    if (paymentId) {
      try {
        const r2 = await fetch(`https://api.mercadolibre.com/payments/${paymentId}?access_token=${tokenResult.token}`)
        if (r2.ok) paymentDetail = await r2.json()
      } catch {}
    }
    const shipmentId = j?.shipping?.id
    if (shipmentId) {
      try {
        const r3 = await fetch(`https://api.mercadolibre.com/shipments/${shipmentId}?access_token=${tokenResult.token}`)
        if (r3.ok) shipmentDetail = await r3.json()
      } catch {}
    }

    return NextResponse.json({
      ok: r.ok,
      status: r.status,
      order_number: target,
      json: j,
      extraido: {
        total_amount: j.total_amount,
        transaction_amount: j.transaction_amount,
        paid_amount: j.paid_amount,
        order_shipping_cost: j.shipping_cost,
        shipping_cost: j.shipping?.cost,
        shipping_cost_by_seller: j.shipping?.cost_by_seller,
        shipping_cost_by_buyer: j.shipping?.cost_by_buyer,
        shipping_mode: j.shipping?.mode,
        itens: j.order_items?.map((it: any) => ({
          title: it.item?.title?.substring(0, 50),
          sale_fee: it.sale_fee,
          unit_price: it.unit_price,
          quantity: it.quantity,
          full_unit_price: it.full_unit_price,
        })),
        payment_extraido: paymentDetail ? {
          transaction_amount: paymentDetail.transaction_amount,
          transaction_amount_refunded: paymentDetail.transaction_amount_refunded,
          shipping_cost: paymentDetail.shipping_cost,
          marketplace_fee: paymentDetail.marketplace_fee,
          coupon_amount: paymentDetail.coupon_amount,
          taxes_amount: paymentDetail.taxes_amount,
          total_paid_amount: paymentDetail.total_paid_amount,
          status: paymentDetail.status,
          status_detail: paymentDetail.status_detail,
          date_approved: paymentDetail.date_approved,
          money_release_date: paymentDetail.money_release_date,
          money_release_status: paymentDetail.money_release_status,
        } : null,
        shipment_extraido: shipmentDetail ? {
          status: shipmentDetail.status,
          shipping_mode: shipmentDetail.mode,
          cost: shipmentDetail.shipping_options?.cost,
          shipping_cost: shipmentDetail.shipping_cost,
          list_cost: shipmentDetail.shipping_options?.list_cost,
          logistic_type: shipmentDetail.logistic_type,
        } : null,
      },
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
