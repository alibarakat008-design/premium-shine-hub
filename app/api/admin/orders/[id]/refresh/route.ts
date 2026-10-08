// POST /api/admin/orders/[id]/refresh
// Busca status atual do pedido e shipment no Mercado Livre
// e atualiza no banco + audit log

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { audit, auditFromRequest } from '@/lib/audit'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const STATUS_MAP: Record<string, string> = {
  paid: 'confirmado',
  confirmed: 'confirmado',
  handling: 'separado',
  ready_to_ship: 'separado',
  shipped: 'enviado',
  delivered: 'entregue',
  cancelled: 'cancelado',
  not_paid: 'pendente',
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const order = await prisma.orders.findUnique({ where: { id: params.id } })
    if (!order) return NextResponse.json({ ok: false, error: 'Pedido não encontrado' }, { status: 404 })
    if (!order.order_number) return NextResponse.json({ ok: false, error: 'Pedido sem order_number' }, { status: 400 })

    const account = await prisma.marketplace_accounts.findFirst({
      where: { nickname: 'LIURAESSENCE' },
    })
    if (!account?.access_token) {
      return NextResponse.json({ ok: false, error: 'Conta ML sem token' }, { status: 500 })
    }

    // 1) Buscar pedido
    const orderRes = await fetch(`https://api.mercadolibre.com/orders/${order.order_number}`, {
      headers: { Authorization: `Bearer ${account.access_token}` },
    })
    if (!orderRes.ok) {
      return NextResponse.json({ ok: false, error: `ML retornou ${orderRes.status}` }, { status: 502 })
    }
    const mlOrder = await orderRes.json()

    // 2) Buscar shipment
    const shipmentId = mlOrder.shipping?.id
    let shipment: any = null
    if (shipmentId) {
      const sRes = await fetch(`https://api.mercadolibre.com/shipments/${shipmentId}`, {
        headers: { Authorization: `Bearer ${account.access_token}` },
      })
      if (sRes.ok) shipment = await sRes.json()
    }

    // Mapear status
    const newStatus = STATUS_MAP[String(mlOrder.status || '').toLowerCase()] || order.status
    const tracking = shipment?.tracking_number || null
    const carrier = shipment?.carrier_info?.name || null
    const previsaoEntrega = shipment?.shipping_option?.estimated_delivery?.date
      ? new Date(shipment.shipping_option.estimated_delivery.date)
      : null
    const dataEnvio = shipment?.date_first_printed ? new Date(shipment.date_first_printed) : null
    const dataEntrega = shipment?.status === 'delivered' && shipment?.date_delivered
      ? new Date(shipment.date_delivered)
      : null

    const antes = {
      status: order.status,
      codigo_rastreio: order.codigo_rastreio,
      transportadora: order.transportadora,
      previsao_entrega: order.previsao_entrega,
    }
    const depois = {
      status: newStatus,
      codigo_rastreio: tracking,
      transportadora: carrier,
      previsao_entrega: previsaoEntrega,
      data_envio: dataEnvio,
      data_entrega: dataEntrega,
    }

    // Detectar mudanças
    const mudou =
      antes.status !== depois.status ||
      antes.codigo_rastreio !== depois.codigo_rastreio ||
      antes.transportadora !== depois.transportadora

    if (!mudou) {
      return NextResponse.json({ ok: true, mudou: false, message: 'Sem mudanças', data: order })
    }

    const updated = await prisma.orders.update({
      where: { id: params.id },
      data: {
        status: newStatus as any,
        codigo_rastreio: tracking,
        transportadora: carrier,
        previsao_entrega: previsaoEntrega,
        data_envio: dataEnvio,
        data_entrega: dataEntrega,
        updated_at: new Date(),
      },
    })

    const ctx = auditFromRequest(req)
    await audit({
      acao: 'order.status_change',
      tabela: 'orders',
      registro_id: order.id,
      dados_anteriores: antes,
      dados_novos: depois,
      ...ctx,
      metadata: { origem: 'refresh_from_ml', order_number: order.order_number, ml_status: mlOrder.status, shipment_status: shipment?.status },
    })

    return NextResponse.json({ ok: true, mudou: true, data: updated, ml_status: mlOrder.status, shipment_status: shipment?.status })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
