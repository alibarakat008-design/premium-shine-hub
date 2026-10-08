import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isMatrizRequest } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

export async function DELETE(request: NextRequest) {
  if (!isMatrizRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  const namePattern = searchParams.get('namePattern')

  try {
    if (id) {
      await prisma.$transaction([
        prisma.inventory.deleteMany({ where: { product_id: id } }),
        prisma.inventory_movements.deleteMany({ where: { product_id: id } }),
        prisma.inventory_reservations.deleteMany({ where: { product_id: id } }),
        prisma.order_items.deleteMany({ where: { product_id: id } }),
        prisma.price_history.deleteMany({ where: { product_id: id } }),
        prisma.product_prices.deleteMany({ where: { product_id: id } }),
        prisma.marketplace_listings.deleteMany({ where: { product_id: id } }),
        prisma.products.delete({ where: { id } }),
      ])
      return NextResponse.json({ success: true, deleted: id })
    } else if (namePattern) {
      const prods = await prisma.products.findMany({
        where: { nome: { contains: namePattern } },
        select: { id: true }
      })
      const ids = prods.map(p => p.id)
      await prisma.$transaction([
        prisma.inventory.deleteMany({ where: { product_id: { in: ids } } }),
        prisma.inventory_movements.deleteMany({ where: { product_id: { in: ids } } }),
        prisma.inventory_reservations.deleteMany({ where: { product_id: { in: ids } } }),
        prisma.order_items.deleteMany({ where: { product_id: { in: ids } } }),
        prisma.price_history.deleteMany({ where: { product_id: { in: ids } } }),
        prisma.product_prices.deleteMany({ where: { product_id: { in: ids } } }),
        prisma.marketplace_listings.deleteMany({ where: { product_id: { in: ids } } }),
        prisma.products.deleteMany({ where: { nome: { contains: namePattern } } }),
      ])
      return NextResponse.json({ success: true, count: ids.length })
    }
    return NextResponse.json({ error: 'Provide id or namePattern' }, { status: 400 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
