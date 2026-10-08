import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * Inspeção completa de uma order
 * GET /api/admin/inspect-order-db?order_number=X
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const orderNumber = searchParams.get('order_number') || ''
    const o = await prisma.orders.findUnique({
      where: { order_number: orderNumber },
      include: {
        marketplace_accounts: { select: { nickname: true, plataforma: true } },
      },
    })
    if (!o) return NextResponse.json({ error: 'não encontrada' }, { status: 404 })
    return NextResponse.json({
      id: o.id,
      order_number: o.order_number,
      total: o.total,
      subtotal: o.subtotal,
      frete: o.frete,
      comissao_seller_pct: o.comissao_seller_pct,
      comissao_seller_valor: o.comissao_seller_valor,
      recebimento_liquido: o.recebimento_liquido,
      status: o.status,
      origem: o.origem,
      conta: o.marketplace_accounts?.nickname,
      plataforma: o.marketplace_accounts?.plataforma,
      created_at: o.created_at,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
