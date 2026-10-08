/**
 * Marca pedidos como etiqueta impressa
 * POST /api/admin/etiquetas/marcar
 * Body: { order_ids: number[] }
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const orderIds: number[] = body.order_ids || []

    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      return NextResponse.json({ ok: false, error: 'order_ids vazio' }, { status: 400 })
    }

    const result = await prisma.orders.updateMany({
      where: { id: { in: orderIds.map(String) } },
      data: {
        etiqueta_impressa: true,
        etiqueta_impressa_em: new Date(),
      },
    })

    return NextResponse.json({ ok: true, atualizados: result.count })
  } catch (err: any) {
    console.error('[API ETIQUETAS/MARCAR]', err)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
