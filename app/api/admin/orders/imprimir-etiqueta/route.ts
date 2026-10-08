/**
 * POST /api/admin/orders/imprimir-etiqueta
 *
 * Tenta baixar etiqueta do Mercado Envios. Se ML não tem (cross_docking etc),
 * gera etiqueta no formato ML via /etiquetas/html.
 *
 * Body: { order_id: string }
 *   1) GET /orders/{id} → pega shipping.id
 *   2) Tenta /shipments/{shipping.id}/labels ou /shipping_label (PDF do ML)
 *   3) Se ML retornar 404 → gera via /etiquetas/html (HTML print-friendly)
 *   4) UPDATE orders.etiqueta_impressa_em = NOW()
 */
import { NextRequest, NextResponse } from 'next/server'
import { getMLToken } from '@/lib/ml-auth-multi'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { order_id } = body

    if (!order_id) {
      return NextResponse.json({ ok: false, error: 'order_id obrigatório' }, { status: 400 })
    }

    const orderRes: any[] = await prisma.$queryRawUnsafe(`
      SELECT o.id::text, o.order_number, o.company_id::text AS company_id,
             o.etiqueta_impressa_em
      FROM orders o WHERE o.id = $1::uuid LIMIT 1
    `, order_id)
    if (orderRes.length === 0) {
      return NextResponse.json({ ok: false, error: 'Venda não encontrada' }, { status: 404 })
    }
    const order = orderRes[0]

    // Pega token da empresa
    const tokenResult = await getMLToken(order.company_id)
    if (!tokenResult?.token) {
      return NextResponse.json({ ok: false, error: 'Sem token ML da empresa' }, { status: 400 })
    }

    // Busca shipping.id do ML
    const orderRes2 = await fetch(`https://api.mercadolibre.com/orders/${order.order_number}`, {
      headers: { Authorization: `Bearer ${tokenResult.token}` },
    })
    if (!orderRes2.ok) {
      return NextResponse.json({ ok: false, error: `ML /orders HTTP ${orderRes2.status}` }, { status: 502 })
    }
    const orderDetail = await orderRes2.json()
    const shipmentId = orderDetail.shipping?.id
    const logisticType = orderDetail.shipping?.logistic_type

    // Marca etiqueta como impressa
    await prisma.$executeRawUnsafe(
      `UPDATE orders SET etiqueta_impressa_em = NOW() WHERE id = $1::uuid`,
      order_id,
    )

    // Tenta ML primeiro (mais bonito, com QR oficial)
    if (shipmentId) {
      const mlUrls = [
        `/shipments/${shipmentId}/labels`,
        `/shipments/${shipmentId}/shipping_label`,
      ]
      for (const path of mlUrls) {
        try {
          const r = await fetch(`https://api.mercadolibre.com${path}`, {
            headers: { Authorization: `Bearer ${tokenResult.token}` },
          })
          if (r.ok) {
            const ct = r.headers.get('content-type') || ''
            if (ct.includes('pdf')) {
              // PDF direto do ML
              const pdfBuf = await r.arrayBuffer()
              return new NextResponse(pdfBuf, {
                headers: {
                  'Content-Type': 'application/pdf',
                  'Content-Disposition': `inline; filename="etiqueta-${order.order_number}.pdf"`,
                  'X-Etiqueta-Impressa': new Date().toISOString(),
                  'X-Fonte': 'mercado-livre-oficial',
                },
              })
            }
            if (ct.includes('json')) {
              const j = await r.json()
              if (j.url || j.pdf_url) {
                return NextResponse.json({
                  ok: true,
                  source: 'mercado-livre-url',
                  download_url: j.url || j.pdf_url,
                  order_number: order.order_number,
                  message: 'Etiqueta gerada pelo ML',
                })
              }
            }
          }
        } catch { /* tenta próximo */ }
      }
    }

    // Fallback: usa nosso /etiquetas/html que gera no formato oficial ML
    // (com QR, código de barras, dados do destinatário via ML API)
    const origin = new URL(req.url).origin
    const htmlUrl = `${origin}/api/admin/etiquetas/html?ids=${order_id}&por_pagina=1&formato=ml`

    return NextResponse.json({
      ok: true,
      source: 'fallback-html',
      order_number: order.order_number,
      logistic_type: logisticType,
      has_ml_label: !!shipmentId,
      message: shipmentId
        ? `Etiqueta ML não disponível (cross_docking/coleta). Gerando etiqueta interna no formato ML...`
        : 'Venda sem Mercado Envios. Gerando etiqueta interna no formato ML...',
      html_url: htmlUrl,
      // Pra UI abrir diretamente em nova aba
      open_url: htmlUrl,
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}