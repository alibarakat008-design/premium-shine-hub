import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// POST /api/admin/set-bonus-envio  {order: "200...", bonus_envio: 3.96}
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const orderId = body.order || body.order_id
    const valor = body.bonus_envio
    if (!orderId || valor == null) {
      return NextResponse.json({ ok: false, error: 'order e bonus_envio obrigatórios' }, { status: 400 })
    }

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId)
    const o = await prisma.orders.findFirst({
      where: {
        OR: [
          ...(isUuid ? [{ id: orderId }] : []),
          { order_number: orderId },
          { pack_id: orderId },
        ],
      },
    })
    if (!o) return NextResponse.json({ ok: false, error: 'venda não encontrada' }, { status: 404 })

    const novoBonusEnvio = Number(Number(valor).toFixed(2))
    await prisma.orders.update({
      where: { id: o.id },
      data: { bonus_envio_valor: novoBonusEnvio },
    })

    return NextResponse.json({
      ok: true,
      order_number: o.order_number,
      pack_id: o.pack_id,
      bonus_envio_anterior: o.bonus_envio_valor != null ? Number(o.bonus_envio_valor.toString()) : 0,
      bonus_envio_novo: novoBonusEnvio,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}