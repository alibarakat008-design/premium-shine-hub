import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    // Apaga todas as orders + items (limpa o banco)
    const itemsDeleted = await prisma.order_items.deleteMany({})
    const ordersDeleted = await prisma.orders.deleteMany({})
    return NextResponse.json({
      ok: true,
      orders_deleted: ordersDeleted.count,
      items_deleted: itemsDeleted.count,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
