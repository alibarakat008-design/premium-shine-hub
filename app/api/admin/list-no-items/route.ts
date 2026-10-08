import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || ''
    if (!authHeader.startsWith('Basic ')) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    const { searchParams } = new URL(req.url)
    const mes = searchParams.get('mes') || '2026-07'
    const [y, m] = mes.split('-').map(Number)
    const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0))
    const end = new Date(Date.UTC(y, m, 1, 0, 0, 0))

    // Vendas SEM order_items
    const orders = await prisma.orders.findMany({
      where: {
        origem: 'mercado_livre',
        pago_em: { gte: start, lt: end },
        order_items: { none: {} },
      },
      select: { order_number: true },
    })

    return NextResponse.json({
      ok: true,
      mes,
      count: orders.length,
      ids: orders.map(o => o.order_number),
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}