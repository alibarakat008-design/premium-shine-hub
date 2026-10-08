import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const sku = body.sku || body.skus
    if (!sku) return NextResponse.json({ ok: false, error: 'sku(s) required' }, { status: 400 })

    const skus: string[] = Array.isArray(sku) ? sku : [sku]
    const log: any[] = []

    for (const sk of skus) {
      // 1. Pega custo atual do product_prices
      const pp = await prisma.product_prices.findFirst({
        where: {
          canal: 'mercado_livre',
          products: { sku: sk },
        },
        orderBy: { updated_at: 'desc' },
      })
      if (!pp) {
        log.push({ sku: sk, ok: false, error: 'no product_prices found' })
        continue
      }
      const custoCerto = pp.custo ? Number(pp.custo.toString()) : null
      if (!custoCerto) {
        log.push({ sku: sk, ok: false, error: 'product_prices custo is null' })
        continue
      }

      // 2. Pega todos order_items com esse sku
      const items = await prisma.order_items.findMany({
        where: { sku: sk },
        include: { orders: { select: { id: true, order_number: true, custo_total: true } } },
      })
      let updatedItems = 0
      let updatedOrders = 0
      const orderIds = new Set<string>()

      for (const i of items) {
        if (i.custo_unitario && Number(i.custo_unitario.toString()) !== custoCerto) {
          await prisma.order_items.update({
            where: { id: i.id },
            data: { custo_unitario: custoCerto },
          })
          updatedItems++
          orderIds.add(i.order_id!)
        }
      }

      // 3. Recalcula orders.custo_total
      for (const oid of orderIds) {
        const allItems = await prisma.order_items.findMany({
          where: { order_id: oid },
        })
        const total = allItems.reduce((sum, i) => {
          const c = i.custo_unitario ? Number(i.custo_unitario.toString()) : 0
          const q = i.quantidade || 0
          return sum + c * q
        }, 0)
        await prisma.orders.update({
          where: { id: oid },
          data: { custo_total: Number(total.toFixed(2)) },
        })
        updatedOrders++
      }

      log.push({
        sku: sk,
        custo_aplicado: custoCerto,
        items_atualizados: updatedItems,
        orders_recalculadas: updatedOrders,
        total_items_com_sku: items.length,
      })
    }

    return NextResponse.json({ ok: true, log })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message, stack: err.stack }, { status: 500 })
  }
}