import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    const total = await prisma.orders.count()
    const items = await prisma.order_items.count()

    const byStatus = await prisma.orders.groupBy({
      by: ['status'],
      _count: true,
    })

    const byOrigem = await prisma.orders.groupBy({
      by: ['origem'],
      _count: true,
    })

    // Por mês
    const all = await prisma.orders.findMany({
      select: { created_at: true },
    })
    const months: Record<string, number> = {}
    for (const o of all) {
      if (!o.created_at) continue
      const d = new Date(o.created_at)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      months[key] = (months[key] || 0) + 1
    }
    const sorted = Object.entries(months).sort(([a], [b]) => a.localeCompare(b))

    return NextResponse.json({
      ok: true,
      total_orders: total,
      total_items: items,
      by_status: byStatus.map((s) => ({ status: s.status, count: s._count })),
      by_origem: byOrigem.map((o) => ({ origem: o.origem, count: o._count })),
      by_month: sorted.map(([m, c]) => ({ mes: m, count: c })),
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
