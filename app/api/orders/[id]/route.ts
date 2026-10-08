/**
 * =====================================================
 * API DE PEDIDO INDIVIDUAL
 * =====================================================
 * GET    /api/orders/:id — Detalhe
 * PATCH  /api/orders/:id — Atualizar (status, rastreio, etc)
 * =====================================================
 */

// app/api/orders/[id]/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const UpdateOrderSchema = z.object({
  status: z.enum(['pendente', 'confirmado', 'separado', 'enviado', 'entregue', 'cancelado', 'devolvido']).optional(),
  codigo_rastreio: z.string().optional().nullable(),
  transportadora: z.string().optional().nullable(),
  previsao_entrega: z.string().optional().nullable(),
  data_envio: z.string().optional().nullable(),
  data_entrega: z.string().optional().nullable(),
  observacao: z.string().optional().nullable(),
})

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params

    const order = await prisma.orders.findUnique({
      where: { id },
      include: {
        customers: true,
        order_items: true,
        companies: true,
      },
    })

    if (!order) {
      return NextResponse.json(
        { success: false, error: 'Pedido não encontrado' },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true, data: order })
  } catch (err: any) {
    console.error('[API Order GET]', err)
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    )
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {

  try {
    const { id } = params
    const body = await request.json()
    const data = UpdateOrderSchema.parse(body)

    const existing = await prisma.orders.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Pedido não encontrado' },
        { status: 404 }
      )
    }

    const updateData: any = { ...data, updated_at: new Date() }

    if (data.status === 'enviado' && !existing.data_envio) {
      updateData.data_envio = new Date()
    }
    if (data.status === 'entregue' && !existing.data_entrega) {
      updateData.data_entrega = new Date()
    }

    const order = await prisma.orders.update({
      where: { id },
      data: updateData,
    })

    await prisma.audit_log.create({
      data: {
        user_id: null,
        acao: 'atualizar_pedido',
        tabela: 'orders',
        registro_id: id,
        dados_anteriores: { status: existing.status },
        dados_novos: data,
      },
    })

    return NextResponse.json({ success: true, data: order })
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Dados inválidos', details: err.errors },
        { status: 400 }
      )
    }
    console.error('[API Order PATCH]', err)
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    )
  }
}
