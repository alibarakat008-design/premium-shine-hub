/**
 * GET /api/admin/test-shipment-labels?order=X
 *
 * Debug: testa várias URLs de etiqueta do ML e retorna qual funciona.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getMLToken } from '@/lib/ml-auth-multi'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const orderNumber = searchParams.get('order')
  if (!orderNumber) {
    return NextResponse.json({ ok: false, error: 'order obrigatório' }, { status: 400 })
  }

  try {
    const order: any[] = await prisma.$queryRawUnsafe(`
      SELECT o.id::text, o.company_id::text AS company_id
      FROM orders o WHERE o.order_number = $1 LIMIT 1
    `, orderNumber)
    if (order.length === 0) {
      return NextResponse.json({ ok: false, error: 'Venda não encontrada' }, { status: 404 })
    }

    const tokenResult = await getMLToken(order[0].company_id)
    if (!tokenResult?.token) {
      return NextResponse.json({ ok: false, error: 'sem token ML' }, { status: 400 })
    }

    // Pega shipping.id
    const orderRes = await fetch(`https://api.mercadolibre.com/orders/${orderNumber}`, {
      headers: { Authorization: `Bearer ${tokenResult.token}` },
    })
    if (!orderRes.ok) {
      return NextResponse.json({ ok: false, error: `ML /orders HTTP ${orderRes.status}` }, { status: 502 })
    }
    const orderDetail = await orderRes.json()
    const shipmentId = orderDetail.shipping?.id

    if (!shipmentId) {
      return NextResponse.json({
        ok: true,
        shipping_id: null,
        order_type: orderDetail.shipping?.mode || 'me2',
        logistic_type: orderDetail.shipping?.logistic_type,
        message: 'Venda sem shipping.id (não é Mercado Envios?)',
      })
    }

    // Testa várias URLs
    const urls = [
      `/shipments/${shipmentId}/shipping_label`,
      `/shipments/${shipmentId}/shipping_label.pdf`,
      `/shipments/${shipmentId}/labels`,
      `/shipments/${shipmentId}/label`,
      `/shipments/${shipmentId}/label.pdf`,
      `/shipments/${shipmentId}/print`,
      `/shipments/${shipmentId}/tracking`,
    ]

    const tests: any[] = []
    for (const path of urls) {
      try {
        const r = await fetch(`https://api.mercadolibre.com${path}`, {
          headers: { Authorization: `Bearer ${tokenResult.token}` },
        })
        const ct = r.headers.get('content-type') || ''
        const buf = await r.arrayBuffer()
        const preview = Buffer.from(buf.slice(0, 80)).toString('utf8').replace(/[^\x20-\x7e]/g, '?').slice(0, 60)
        tests.push({
          path,
          status: r.status,
          content_type: ct,
          size: buf.byteLength,
          preview,
          is_pdf: ct.includes('pdf'),
          is_json: ct.includes('json'),
        })
      } catch (e: any) {
        tests.push({ path, error: e.message })
      }
    }

    return NextResponse.json({
      ok: true,
      order_number: orderNumber,
      shipment_id: shipmentId,
      logistic_type: orderDetail.shipping?.logistic_type,
      tests,
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}