// PATCH /api/admin/orders/bulk
// Atualiza status de múltiplos pedidos de uma vez
// Body: { ids: string[], status: string, codigo_rastreio?: string, transportadora?: string }

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { audit, auditFromRequest } from '@/lib/audit'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const ids: string[] = body.ids || []
    const status: string = body.status
    const codigoRastreio: string | undefined = body.codigo_rastreio
    const transportadora: string | undefined = body.transportadora
    const previsaoEntrega: string | undefined = body.previsao_entrega

    if (!ids.length || !status) {
      return NextResponse.json({ ok: false, error: 'ids e status são obrigatórios' }, { status: 400 })
    }
    if (ids.length > 500) {
      return NextResponse.json({ ok: false, error: 'Máximo 500 pedidos por vez' }, { status: 400 })
    }

    // Buscar estado anterior
    const orders = await prisma.orders.findMany({
      where: { id: { in: ids } },
      select: { id: true, status: true, codigo_rastreio: true, transportadora: true, order_number: true },
    })
    if (orders.length === 0) {
      return NextResponse.json({ ok: false, error: 'Nenhum pedido encontrado' }, { status: 404 })
    }

    const data: any = { status, updated_at: new Date() }
    if (codigoRastreio !== undefined) data.codigo_rastreio = codigoRastreio
    if (transportadora !== undefined) data.transportadora = transportadora
    if (previsaoEntrega !== undefined) data.previsao_entrega = previsaoEntrega ? new Date(previsaoEntrega) : null

    if (status === 'enviado') data.data_envio = new Date()
    if (status === 'entregue') data.data_entrega = new Date()

    const result = await prisma.orders.updateMany({
      where: { id: { in: orders.map((o) => o.id) } },
      data,
    })

    const ctx = auditFromRequest(req)
    await audit({
      acao: 'order.status_change',
      tabela: 'orders',
      dados_novos: {
        total_alterados: result.count,
        status_novo: status,
        codigo_rastreio: codigoRastreio || null,
        transportadora: transportadora || null,
        pedidos: orders.slice(0, 30).map((o) => ({ id: o.id, order_number: o.order_number, status_anterior: o.status })),
      },
      ...ctx,
      metadata: { origem: 'bulk_update', total_solicitados: ids.length, total_encontrados: orders.length },
    })

    return NextResponse.json({
      ok: true,
      total_solicitados: ids.length,
      total_encontrados: orders.length,
      total_atualizados: result.count,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
