import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const orderNumber = '2000017126736270'

    const order = await prisma.orders.findFirst({
      where: { order_number: orderNumber },
      include: {
        order_items: {
          include: {
            products: {
              include: {
                product_prices: { where: { canal: 'mercado_livre' }, take: 1 },
              },
            },
          },
        },
      },
    })

    if (!order) return NextResponse.json({ ok: false, error: 'not found' })

    return NextResponse.json({
      ok: true,
      order_number: order.order_number,
      pack_id: order.pack_id,
      items: order.order_items.map(it => ({
        sku: it.sku,
        product_id: it.product_id,
        custo_unitario: Number(it.custo_unitario),
        product_name: it.products?.nome,
        product_prices_count: it.products?.product_prices?.length ?? 0,
        product_prices_custo: it.products?.product_prices?.[0]?.custo ? Number(it.products.product_prices[0].custo) : null,
      })),
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}