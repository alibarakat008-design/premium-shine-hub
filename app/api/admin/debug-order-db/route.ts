import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const orderNumber = searchParams.get('order_number') || '2000017121487672'

    const order = await prisma.orders.findFirst({
      where: { order_number: orderNumber },
      select: {
        order_number: true,
        pack_id: true,
        total: true,
        comissao_seller_valor: true,
        frete: true,
        custo_flex: true,
        recebimento_liquido: true,
        tipo_envio: true,
        desconto: true,
        bonus_envio_valor: true,
        bonus_cupom_valor: true,
        tarifa_pct_valor: true,
        tarifa_fixa_valor: true,
        total_paid_amount: true,
        origem: true,
      },
    })

    return NextResponse.json({ ok: true, order })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}