// PATCH /api/admin/orders/[id]/status
// Atualiza status de um pedido + registra no audit log
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { audit, auditFromRequest } from '@/lib/audit'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = params.id
    const body = await req.json()
    const { status, codigo_rastreio, transportadora, previsao_entrega, observacoes } = body

    if (!status) {
      return NextResponse.json({ ok: false, error: 'status é obrigatório' }, { status: 400 })
    }

    const order = await prisma.orders.findUnique({ where: { id } })
    if (!order) {
      return NextResponse.json({ ok: false, error: 'Pedido não encontrado' }, { status: 404 })
    }

    const statusAnterior = order.status
    const data: any = { status, updated_at: new Date() }
    if (codigo_rastreio !== undefined) data.codigo_rastreio = codigo_rastreio
    if (transportadora !== undefined) data.transportadora = transportadora
    if (previsao_entrega !== undefined) data.previsao_entrega = previsao_entrega ? new Date(previsao_entrega) : null

    // Auto-preenche datas baseado no status
    if (status === 'enviado' && !order.data_envio) data.data_envio = new Date()
    if (status === 'entregue' && !order.data_entrega) data.data_entrega = new Date()

    const updated = await prisma.orders.update({ where: { id }, data })

    // Audit log
    const ctx = auditFromRequest(req)
    await audit({
      acao: 'order.status_change',
      tabela: 'orders',
      registro_id: id,
      dados_anteriores: { status: statusAnterior, codigo_rastreio: order.codigo_rastreio, transportadora: order.transportadora },
      dados_novos: { status, codigo_rastreio: data.codigo_rastreio, transportadora: data.transportadora, previsao_entrega: data.previsao_entrega, observacoes },
      ...ctx,
      metadata: { order_number: order.order_number },
    })

    return NextResponse.json({ ok: true, data: updated })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
