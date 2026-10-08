import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const skus = ['MLB4473564109', 'MLB6863302018', 'MLB4473655583', 'MLB4722264359', 'MLB6420453312', 'MLB4473680231', 'MLB4764594089', 'MLB6978473936', 'MLB4722290035']

    const result: any[] = []
    for (const sku of skus) {
      const items = await prisma.order_items.findMany({
        where: { sku },
        select: { id: true, product_id: true, custo_unitario: true },
        take: 5,
      })
      const product = await prisma.products.findUnique({
        where: { sku },
        select: { id: true },
      })
      result.push({
        sku,
        product_id_no_products: product?.id,
        samples: items.map(i => ({ item_id: i.id.substring(0, 8), product_id: i.product_id?.substring(0, 8), custo: Number(i.custo_unitario) })),
      })
    }

    return NextResponse.json({ ok: true, skus: result })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}