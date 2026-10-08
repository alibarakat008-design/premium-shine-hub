/**
 * =====================================================
 * API PÚBLICA: Rastreio de Pedido (sem login)
 * =====================================================
 * GET /api/public/rastreio/:codigo
 *
 * Retorna status + histórico do pedido
 * =====================================================
 */

// app/api/public/rastreio/[codigo]/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey } from '@/lib/integracao-site/config'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, { params }: { params: { codigo: string } }) {

  const auth = await validateApiKey(request)
  if (!auth.valid) {
    return NextResponse.json({ error: auth.error }, { status: 401 })
  }

  const { codigo } = params

  // Buscar pedido pelo código de rastreio OU order_number
  const order = await prisma.orders.findFirst({
    where: {
      OR: [
        { codigo_rastreio: codigo },
        { order_number: codigo },
        { payment_id: codigo },
      ],
    },
    include: {
      customers: { select: { nome: true } },
    },
  })

  if (!order) {
    return NextResponse.json({ success: false, error: 'Não encontrado' }, { status: 404 })
  }

  // Montar timeline
  const events: any[] = []

  // Pedido criado
  events.push({
    date: order.created_at,
    status: 'Pedido criado',
    local: 'Sistema',
    description: 'Pedido recebido e em processamento',
  })

  // Pago
  if (order.pago_em) {
    events.push({
      date: order.pago_em,
      status: 'Pagamento confirmado',
      local: 'Gateway de pagamento',
      description: 'Pagamento aprovado via PIX',
    })
  }

  // Separado (se tiver log)
  // (Aqui você integraria com a transportadora real)

  // Enviado
  if (order.data_envio) {
    events.push({
      date: order.data_envio,
      status: 'Pedido enviado',
      local: order.transportadora || 'Transportadora',
      description: `Pedido postado. Rastreio: ${order.codigo_rastreio}`,
    })
  }

  // Entregue
  if (order.data_entrega) {
    events.push({
      date: order.data_entrega,
      status: 'Entregue',
      local: 'Endereço de entrega',
      description: 'Pedido entregue com sucesso',
    })
  }

  return NextResponse.json({
    success: true,
    data: {
      order_number: order.order_number,
      status: order.status,
      customer_name: order.customers?.nome || '',
      transportadora: order.transportadora || '',
      previsao_entrega: order.previsao_entrega,
      codigo_rastreio: order.codigo_rastreio,
      events,
    },
  })
}
