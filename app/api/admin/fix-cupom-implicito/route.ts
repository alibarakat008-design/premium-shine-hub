import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const orderId = body.order_id || body.order
    if (!orderId) return NextResponse.json({ ok: false, error: 'order_id required' }, { status: 400 })

    const dec = (d: any) => (d ? Number(d.toString()) : null)
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
    if (!o) return NextResponse.json({ ok: false, error: 'order not found' }, { status: 404 })

    const total = dec(o.total)
    const comissaoSeller = dec(o.comissao_seller_valor) || 0
    const tarifaPct = total * 0.12

    // cupom implícito = tarifa_pct - comissao_seller (se positivo)
    const cupomImplicito = Math.max(0, Number((tarifaPct - comissaoSeller).toFixed(2)))

    // cupom explícito armazenado
    const cupomAtual = dec(o.bonus_cupom_valor) || 0
    const novoCupom = Number((cupomAtual + cupomImplicito).toFixed(2))

    await prisma.orders.update({
      where: { id: o.id },
      data: {
        bonus_cupom_valor: novoCupom,
        tarifa_pct_valor: Number(tarifaPct.toFixed(2)),
      },
    })

    return NextResponse.json({
      ok: true,
      order_number: o.order_number,
      total,
      comissao_seller: comissaoSeller,
      tarifa_pct_bruto: Number(tarifaPct.toFixed(2)),
      cupom_implicito_calculado: cupomImplicito,
      cupom_anterior: cupomAtual,
      cupom_novo: novoCupom,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}