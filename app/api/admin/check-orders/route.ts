import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * GET /api/admin/check-orders?ids=1,2,3
 * Debug: checa se order_numbers existem no DB
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const idsParam = searchParams.get('ids') || ''
    const ids = idsParam.split(',').filter(Boolean)

    // Procura por order_number
    const byOrderNumber = await prisma.orders.findMany({
      where: { order_number: { in: ids } },
      select: { id: true, order_number: true, status: true, total: true, created_at: true },
    })

    // Procura por payment_id
    const byPaymentId = await prisma.orders.findMany({
      where: { payment_id: { in: ids } },
      select: { id: true, order_number: true, payment_id: true, status: true, total: true, created_at: true },
    })

    // Conta total de orders com mercado_livre origem
    const total = await prisma.orders.count({
      where: { origem: 'mercado_livre' },
    })

    // Quantas em junho/2026
    const junho = await prisma.orders.count({
      where: {
        origem: 'mercado_livre',
        pago_em: { gte: new Date('2026-05-31T03:00:00.000Z'), lte: new Date('2026-07-01T03:00:00.000Z') },
      },
    })

    return NextResponse.json({
      ok: true,
      total_mercado_livre: total,
      total_junho_2026: junho,
      searched_ids: ids.length,
      by_order_number: byOrderNumber.length,
      by_payment_id: byPaymentId.length,
      sample: byOrderNumber.slice(0, 5).map(o => ({ order_number: o.order_number, total: o.total, status: o.status })),
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}