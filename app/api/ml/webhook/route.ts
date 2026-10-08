// POST /api/ml/webhook
// Recebe notificações do Mercado Livre
// Tipos de eventos: orders, shipments, items, etc
// Configurado no painel do ML: https://developers.mercadolivre.com.br/notificaciones

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    // Mercado Livre manda no body: { resource, user_id, topic, application_id, sent, attempts }
    const body = await req.nextUrl.searchParams
    // ML manda via query string também em alguns casos
    const url = new URL(req.url)
    const topic = url.searchParams.get('topic') || body.get('topic')
    const resource = url.searchParams.get('resource') || body.get('resource')

    console.log('[ML Webhook]', { topic, resource })

    // Se for notificação de orders (novo pedido), processa
    if (topic === 'orders' || topic === 'orders_v2') {
      // resource é a URL do recurso (ex: https://api.mercadolibre.com/orders/123)
      const orderId = resource?.match(/orders\/(\d+)/)?.[1]
      if (orderId) {
        // Atualiza a venda (não duplica porque o sync já é idempotente)
        await processarNovaVenda(orderId)
      }
    } else if (topic === 'shipments' || topic === 'shipments_v2') {
      // Notificação de envio (atualizou status de envio)
      const shipmentId = resource?.match(/shipments\/(\d+)/)?.[1]
      if (shipmentId) {
        await processarShipment(shipmentId)
      }
    } else if (topic === 'items' || topic === 'items_v2') {
      // Notificação de item (preço, estoque, status)
      // Apenas logamos
    }

    return NextResponse.json({ ok: true, topic, resource })
  } catch (err: any) {
    console.error('[ML Webhook] Erro:', err)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

// GET: verificação de URL pelo ML
export async function GET(req: NextRequest) {
  return NextResponse.json({ ok: true, message: 'Webhook ML ativo' })
}

async function processarNovaVenda(orderId: string) {
  try {
    const account = await prisma.marketplace_accounts.findFirst({
      where: { nickname: 'LIURAESSENCE' },
    })
    if (!account?.access_token) return

    // Buscar detalhes da order
    const res = await fetch(`https://api.mercadolibre.com/orders/${orderId}`, {
      headers: { Authorization: `Bearer ${account.access_token}` },
    })
    if (!res.ok) return
    const orderDetail = await res.json()
    const total = Number(orderDetail.total_amount || 0)
    const status = String(orderDetail.status || '').toLowerCase()
    const dataFechado = orderDetail.date_closed ? new Date(orderDetail.date_closed) : null
    const dataCriado = orderDetail.date_created ? new Date(orderDetail.date_created) : new Date()

    // Verificar se já existe
    const existing = await prisma.orders.findFirst({
      where: { order_number: orderId },
    })
    if (existing) {
      // Atualiza status
      const statusMap: any = {
        paid: 'confirmado', confirmed: 'confirmado', handling: 'separado',
        ready_to_ship: 'separado', shipped: 'enviado', delivered: 'entregue',
        cancelled: 'cancelado', not_paid: 'pendente',
      }
      await prisma.orders.update({
        where: { id: existing.id },
        data: { status: statusMap[status] || existing.status, updated_at: new Date() },
      })
      return
    }

    // Criar nova
    const company = await prisma.companies.findFirst({ where: { ativa: true } })
    if (!company) return
    const dataVenda = dataFechado || dataCriado

    await prisma.orders.create({
      data: {
        order_number: orderId,
        total,
        subtotal: total,
        origem: 'mercado_livre',
        status: status === 'paid' || status === 'confirmed' ? 'confirmado' : 'pendente',
        company_id: company.id,
        created_at: dataVenda,
        updated_at: new Date(),
      },
    })
  } catch (err: any) {
    console.error('[processarNovaVenda]', err)
  }
}

async function processarShipment(shipmentId: string) {
  try {
    const account = await prisma.marketplace_accounts.findFirst({
      where: { nickname: 'LIURAESSENCE' },
    })
    if (!account?.access_token) return

    const res = await fetch(`https://api.mercadolibre.com/shipments/${shipmentId}`, {
      headers: { Authorization: `Bearer ${account.access_token}` },
    })
    if (!res.ok) return
    const shipment = await res.json()
    const orderId = String(shipment.order_id || '')

    // Mapear status de envio → status do pedido
    const substatus = String(shipment.substatus || '').toLowerCase()
    const statusMap: Record<string, string> = {
      ready_to_ship: 'separado',
      shipped: 'enviado',
      delivered: 'entregue',
      cancelled: 'cancelado',
      not_delivered: 'enviado',
    }
    const newStatus = statusMap[substatus] || (shipment.status === 'shipped' ? 'enviado' : null)
    if (!newStatus) return

    await prisma.orders.updateMany({
      where: { order_number: orderId },
      data: {
        status: newStatus as any,
        codigo_rastreio: shipment.tracking_number || null,
        transportadora: shipment.carrier_info?.name || null,
        updated_at: new Date(),
      },
    })
  } catch (err: any) {
    console.error('[processarShipment]', err)
  }
}
