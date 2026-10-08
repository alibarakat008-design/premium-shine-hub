import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * Lista orders recentes com info do banco
 * GET /api/admin/find-orders-with-freight
 *   ?mode=with_freight (orders que tem frete > 0)
 *   ?mode=without_freight (frete = 0)
 *   ?limit=10
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const mode = searchParams.get('mode') || 'both'
    const limit = parseInt(searchParams.get('limit') || '5')

    let where: any = { origem: 'mercado_livre' }
    if (mode === 'with_freight') {
      where.frete = { gt: 0 }
    } else if (mode === 'without_freight') {
      where.frete = { equals: 0 }
      where.recebimento_liquido = { not: null }
    } else if (mode === 'no_data') {
      where.comissao_seller_valor = null
      where.frete = null
    } else if (mode === 'high_total') {
      // orders com total alto (>R$100) e sem dados processados
      where.total = { gt: 100 }
      where.comissao_seller_valor = null
    }

    const orders = await prisma.orders.findMany({
      where,
      select: {
        order_number: true,
        total: true,
        subtotal: true,
        frete: true,
        comissao_seller_valor: true,
        comissao_seller_pct: true,
        recebimento_liquido: true,
        created_at: true,
        marketplace_accounts: { select: { nickname: true } },
      },
      orderBy: { created_at: 'desc' },
      take: limit,
    })

    return NextResponse.json({
      success: true,
      mode,
      total: orders.length,
      orders: orders.map((o) => ({
        order_number: o.order_number,
        venda: Number(o.total),
        comissao: o.comissao_seller_valor != null ? Number(o.comissao_seller_valor) : null,
        comissao_pct: o.comissao_seller_pct != null ? Number(o.comissao_seller_pct) : null,
        frete: o.frete != null ? Number(o.frete) : null,
        recebimento: o.recebimento_liquido != null ? Number(o.recebimento_liquido) : null,
        conta: o.marketplace_accounts?.nickname,
        data: o.created_at,
      })),
    })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
