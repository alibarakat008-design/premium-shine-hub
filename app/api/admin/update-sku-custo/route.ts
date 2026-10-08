import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * Atualiza o custo de um SKU em product_prices e recalcula margens.
 *
 * GET /api/admin/update-sku-custo?sku=MLB4473564109&custo=17&canal=mercado_livre
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const sku = searchParams.get('sku') || ''
    const custoStr = searchParams.get('custo') || '0'
    const canal = searchParams.get('canal') || 'mercado_livre'

    const custo = Number(custoStr)
    if (!sku || isNaN(custo)) {
      return NextResponse.json({ ok: false, error: 'sku e custo são obrigatórios' }, { status: 400 })
    }

    // 1. Acha o product_id pelo sku
    const product = await prisma.products.findUnique({
      where: { sku },
      select: { id: true, sku: true, nome: true },
    })

    if (!product) {
      return NextResponse.json({ ok: false, error: `SKU ${sku} não encontrado em products` }, { status: 404 })
    }

    // 2. Atualiza ou cria product_prices pra esse canal
    let ppUpdated = await prisma.product_prices.updateMany({
      where: { product_id: product.id, canal: canal as any },
      data: { custo },
    })
    if (ppUpdated.count === 0) {
      await prisma.product_prices.create({
        data: { product_id: product.id, canal: canal as any, custo, preco_venda: 0 },
      })
      ppUpdated = { count: 1 } as any
    }
    const pp = ppUpdated

    // 3. Atualiza TODOS os order_items que ainda têm custo=0 ou null
    const items = await prisma.order_items.updateMany({
      where: { sku, OR: [{ custo_unitario: null }, { custo_unitario: 0 }] },
      data: { custo_unitario: custo },
    })

    // 4. Recalcula margem em todas as vendas que tenham esse item
    const orderItems = await prisma.order_items.findMany({
      where: { sku },
      select: { order_id: true, sku: true, quantidade: true, custo_unitario: true },
    })
    const orderIds = [...new Set(orderItems.map(i => i.order_id))]

    const orders = await prisma.orders.findMany({
      where: { id: { in: orderIds } },
      select: { id: true, total: true, recebimento_liquido: true },
    })

    // Agrupa itens por order_id
    const itemsByOrder = new Map<string, typeof orderItems>()
    for (const it of orderItems) {
      if (!it.order_id) continue
      const arr = itemsByOrder.get(it.order_id) || []
      arr.push(it)
      itemsByOrder.set(it.order_id, arr)
    }

    let ordersUpdated = 0
    for (const o of orders) {
      const items = itemsByOrder.get(o.id) || []
      const custoTotal = items.reduce((sum, it) => sum + Number(it.custo_unitario || 0) * it.quantidade, 0)
      const margemReais = Number(o.recebimento_liquido || 0) - custoTotal
      const margemPct = Number(o.total) > 0 ? (margemReais / Number(o.total)) * 100 : 0

      await prisma.orders.update({
        where: { id: o.id },
        data: { custo_total: custoTotal },
      })
      ordersUpdated++
    }

    return NextResponse.json({
      ok: true,
      sku,
      custo,
      produto: { id: product.id, nome: product.nome },
      product_prices_updated: pp.count,
      order_items_updated: items.count,
      orders_updated: ordersUpdated,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}