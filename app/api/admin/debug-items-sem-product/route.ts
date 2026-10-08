import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    // Acha itens sem product_id, agrupa por sku
    const items = await prisma.order_items.findMany({
      where: { product_id: null },
      select: { sku: true },
      take: 1000,
    })
    const skuCounts: Record<string, number> = {}
    for (const it of items) {
      if (!it.sku) continue
      skuCounts[it.sku] = (skuCounts[it.sku] || 0) + 1
    }
    const skus = Object.keys(skuCounts)

    // Pra cada SKU, vê se tem product cadastrado
    const result: any[] = []
    for (const sku of skus.slice(0, 30)) {
      const product = await prisma.products.findUnique({
        where: { sku },
        select: { id: true, nome: true },
      })
      const total = skuCounts[sku]
      result.push({
        sku,
        total_itens: total,
        product_cadastrado: product ? { id: product.id, nome: product.nome } : null,
      })
    }

    return NextResponse.json({
      ok: true,
      total_itens_sem_product: items.length,
      skus_distintos: skus.length,
      exemplo_30: result,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}