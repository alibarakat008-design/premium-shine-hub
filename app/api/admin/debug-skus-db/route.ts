import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const skus = ['MLB4473564109', 'MLB6863302018', 'MLB4473655583', 'MLB4722264359', 'MLB6420453312', 'MLB4473680231', 'MLB4764594089', 'MLB6978473936', 'MLB4722290035']

    const result: any[] = []
    for (const sku of skus) {
      const product = await prisma.products.findUnique({
        where: { sku },
        select: { id: true, nome: true },
      })

      const pp = product ? await prisma.product_prices.findMany({
        where: { product_id: product.id },
        select: { canal: true, custo: true },
      }) : []

      const items = await prisma.order_items.count({
        where: { sku, OR: [{ custo_unitario: null }, { custo_unitario: 0 }] },
      })

      result.push({
        sku,
        product: product ? { id: product.id, nome: product.nome } : null,
        product_prices: pp.map(p => ({ canal: p.canal, custo: Number(p.custo) })),
        items_sem_custo: items,
      })
    }

    return NextResponse.json({ ok: true, skus: result })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}