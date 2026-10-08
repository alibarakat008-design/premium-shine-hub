// /api/admin/delete-produto
// DELETE: exclui produto pelo ID
// Query: ?id=X
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isMatrizRequest } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

export async function DELETE(req: NextRequest) {
  if (!isMatrizRequest(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) {
      return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
    }
    // Delete from ALL tables that reference this product (NOT orders/transactions!)
    // Tables with NoAction FK → must delete explicitly:
    const manualDelete = [
      'product_prices',
      'inventory',
      'inventory_movements',
      'inventory_reservations',
      'listing_map',
    ]
    // Tables with CASCADE → auto-delete when product is deleted:
    // - product_cost_history
    // - marketplace_listings
    // - product_bundles
    // TABLES TO NEVER DELETE (transactions):
    // - orders, order_items, supplier_purchases, supplier_purchase_items

    for (const table of manualDelete) {
      try {
        await prisma.$executeRawUnsafe(
          `DELETE FROM "${table}" WHERE product_id = '${id}'`
        )
      } catch { /* table may not exist or have no rows */ }
    }
    try {
      const deleted = await prisma.products.delete({ where: { id } })
      return NextResponse.json({ ok: true, deleted: deleted.sku })
    } catch (err: any) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
    }
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
