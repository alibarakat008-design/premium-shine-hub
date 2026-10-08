import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * Atualiza custo_unitário de TODOS order_items com esse SKU e recalcula orders.
 * Não precisa de product_prices/products linkado.
 *
 * GET /api/admin/update-order-item-custo?sku=MLB6978473936&custo=80
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const sku = searchParams.get('sku') || ''
    const custoStr = searchParams.get('custo') || '0'
    const createProduct = searchParams.get('create_product') === '1'

    const custo = Number(custoStr)
    if (!sku || isNaN(custo)) {
      return NextResponse.json({ ok: false, error: 'sku e custo são obrigatórios' }, { status: 400 })
    }

    // 1. Opcionalmente cria o product se não existir
    let productInfo: any = null
    if (createProduct) {
      const existing = await prisma.products.findUnique({ where: { sku } })
      if (!existing) {
        // Pega o nome do primeiro order_item
        const sample = await prisma.order_items.findFirst({ where: { sku } })
        if (sample) {
          const novo = await prisma.products.create({
            data: { sku, nome: sample.nome_produto || sku },
          })
          productInfo = { id: novo.id, sku: novo.sku, criado: true }
        }
      } else {
        productInfo = { id: existing.id, sku: existing.sku, criado: false }
      }
    }

    // 2. Atualiza order_items
    const items = await prisma.order_items.updateMany({
      where: { sku },
      data: { custo_unitario: custo },
    })

    // 3. Recalcula orders
    const orderItems = await prisma.order_items.findMany({
      where: { sku },
      select: { order_id: true, quantidade: true, custo_unitario: true },
    })
    const orderIds = [...new Set(orderItems.map(i => i.order_id).filter(Boolean))]
    const itemsByOrder = new Map<string, typeof orderItems>()
    for (const it of orderItems) {
      if (!it.order_id) continue
      const arr = itemsByOrder.get(it.order_id) || []
      arr.push(it)
      itemsByOrder.set(it.order_id, arr)
    }

    let ordersUpdated = 0
    for (const orderId of orderIds) {
      const its = itemsByOrder.get(orderId) || []
      // Soma APENAS itens COM custo_unitario > 0 (evita contar sem custo)
      const custoTotal = its
        .filter(it => Number(it.custo_unitario || 0) > 0)
        .reduce((sum, it) => sum + Number(it.custo_unitario || 0) * it.quantidade, 0)
      await prisma.orders.update({
        where: { id: orderId },
        data: { custo_total: custoTotal },
      })
      ordersUpdated++
    }

    return NextResponse.json({
      ok: true,
      sku,
      custo,
      product: productInfo,
      order_items_updated: items.count,
      orders_updated: ordersUpdated,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}