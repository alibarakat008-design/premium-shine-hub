import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isMatrizRequest } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  if (!isMatrizRequest(req)) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { action, ids } = await req.json()
  const BARBOURS_ID = '8a4056e0-e491-4c11-ac22-d92d85d13cfc'

  // ACTION: delete-many - deleta múltiplos produtos (cascade manual)
  if (action === 'delete-many') {
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids é obrigatório' }, { status: 400 })
    }

    const deleted: string[] = []
    const renamed: string[] = []
    const errors: string[] = []

    for (const id of ids) {
      try {
        // Verificar se tem order_items (FK constraint)
        const hasOrders = await prisma.order_items.findFirst({
          where: { product_id: id }
        })

        if (hasOrders) {
          // Renomear para indicar que foi desativado
          const p = await prisma.products.findUnique({ where: { id }, select: { nome: true } })
          await prisma.products.update({
            where: { id },
            data: {
              nome: `[DELETADO] ${p?.nome ?? id}`,
              ativo: false,
              publicado_site: false,
              publicado_shopee: false,
            }
          })
          renamed.push(id)
        } else {
          // Cascade delete: only tables with CASCADE FK auto-delete
          // Tables with NoAction FK (product_prices, inventory, etc) need explicit delete
          await prisma.product_prices.deleteMany({ where: { product_id: id } }).catch(() => {})
          await prisma.inventory.deleteMany({ where: { product_id: id } }).catch(() => {})
          await prisma.inventory_movements.deleteMany({ where: { product_id: id } }).catch(() => {})
          await prisma.inventory_reservations.deleteMany({ where: { product_id: id } }).catch(() => {})
          await prisma.marketplace_listings.deleteMany({ where: { product_id: id } }).catch(() => {})
          await prisma.pricing_rules.deleteMany({ where: { product_id: id } }).catch(() => {})
          await prisma.product_promotions.deleteMany({ where: { product_id: id } }).catch(() => {})
          await prisma.affiliate_links.deleteMany({ where: { product_id: id } }).catch(() => {})
          // product_cost_history has cascade delete
          // product_bundles has cascade delete
          await prisma.products.delete({ where: { id } })
          deleted.push(id)
        }
      } catch (e: any) {
        errors.push(`${id}: ${e.message}`)
      }
    }

    // Contar restantes
    const remaining = await prisma.products.count({
      where: { marca_id: BARBOURS_ID }
    })

    return NextResponse.json({
      deleted: deleted.length,
      renamed: renamed.length,
      errors,
      remaining,
    })
  }

  // ACTION: list - lista todos BARBOURS ATIVOS com info de order_items
  if (action === 'list') {
    const allProducts = await prisma.products.findMany({
      where: { marca_id: BARBOURS_ID, ativo: true },
      select: { id: true, nome: true, sku: true, ean: true, ativo: true, categoria_id: true },
      orderBy: { nome: 'asc' }
    })

    // Verificar quais têm orders
    const ids = allProducts.map(p => p.id)
    const orderItems = await prisma.order_items.findMany({
      where: { product_id: { in: ids } },
      select: { product_id: true }
    })
    const productIdsWithOrders = new Set(orderItems.map(oi => oi.product_id))

    const withOrders = allProducts.filter(p => productIdsWithOrders.has(p.id))
    const withoutOrders = allProducts.filter(p => !productIdsWithOrders.has(p.id))

    return NextResponse.json({
      total: allProducts.length,
      withOrders: withOrders.length,
      withoutOrders: withoutOrders.length,
      withOrdersList: withOrders.map(p => ({ id: p.id, nome: p.nome })),
      withoutOrdersList: withoutOrders.map(p => ({ id: p.id, nome: p.nome })),
    })
  }

  return NextResponse.json({ error: 'action inválida' }, { status: 400 })
}

// ACTION: deactivate-by-name - desativa produtos por padrão no nome
export async function PATCH(req: NextRequest) {
  if (!isMatrizRequest(req)) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { action, nomePattern } = await req.json()
  const BARBOURS_ID = '8a4056e0-e491-4c11-ac22-d92d85d13cfc'

  if (action === 'deactivate-by-name') {
    const products = await prisma.products.findMany({
      where: {
        marca_id: BARBOURS_ID,
        ativo: true,
        nome: { contains: nomePattern, mode: 'insensitive' }
      },
      select: { id: true, nome: true }
    })

    const deactivated: string[] = []
    for (const p of products) {
      await prisma.products.update({
        where: { id: p.id },
        data: { ativo: false, publicado_site: false, publicado_shopee: false }
      })
      deactivated.push(p.nome)
    }

    return NextResponse.json({
      deactivated,
      count: deactivated.length,
    })
  }

  return NextResponse.json({ error: 'action inválida' }, { status: 400 })
}
