// DELETE /api/admin/remove-produto?id=uuid  — remove 1 produto
// DELETE /api/admin/remove-produto?ids=uuid1,uuid2,uuid3 — bulk remove (1 transação)
import { NextRequest, NextResponse } from 'next/server'
import { isMatrizRequest } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function DELETE(req: NextRequest) {
  if (!isMatrizRequest(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const idsParam = searchParams.get('ids')
  const singleId = searchParams.get('id')

  // ── BULK: ids=csv ──
  if (idsParam) {
    const ids = idsParam.split(',').map(s => s.trim()).filter(Boolean)
    if (ids.length === 0) {
      return NextResponse.json({ ok: false, error: 'ids vazio' }, { status: 400 })
    }
    try {
      const result = await prisma.$transaction(async (tx) => {
        let deleted = 0
        let alreadyDeleted = 0
        for (const id of ids) {
          try {
            // Quebra referências em order_items
            await tx.order_items.updateMany({
              where: { product_id: id },
              data: { product_id: null },
            })
            // Limpa audit_log
            await tx.audit_log.updateMany({
              where: { registro_id: id },
              data: { registro_id: null },
            })
            // Deleta dependentes
            await tx.marketplace_listings.deleteMany({ where: { product_id: id } })
            await tx.inventory_movements.deleteMany({ where: { product_id: id } })
            await tx.inventory_reservations.deleteMany({ where: { product_id: id } })
            await tx.inventory.deleteMany({ where: { product_id: id } })
            await tx.product_prices.deleteMany({ where: { product_id: id } })
            // Deleta o produto
            await tx.products.delete({ where: { id } })
            deleted++
          } catch (err: any) {
            if (err.code === 'P2025') {
              alreadyDeleted++
            } else {
              throw err
            }
          }
        }
        return { deleted, alreadyDeleted, total: ids.length }
      })
      return NextResponse.json({ ok: true, ...result })
    } catch (err: any) {
      console.error('[remove-produto] bulk error', err)
      return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
    }
  }

  // ── SINGLE ──
  if (!singleId) {
    return NextResponse.json({ ok: false, error: 'id obrigatório' }, { status: 400 })
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.order_items.updateMany({
        where: { product_id: singleId },
        data: { product_id: null },
      })
      await tx.audit_log.updateMany({
        where: { registro_id: singleId },
        data: { registro_id: null },
      })
      await tx.marketplace_listings.deleteMany({ where: { product_id: singleId } })
      await tx.inventory_movements.deleteMany({ where: { product_id: singleId } })
      await tx.inventory_reservations.deleteMany({ where: { product_id: singleId } })
      await tx.inventory.deleteMany({ where: { product_id: singleId } })
      await tx.product_prices.deleteMany({ where: { product_id: singleId } })
      await tx.products.delete({ where: { id: singleId } })
    })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    if (err.code === 'P2025') {
      return NextResponse.json({ ok: true, alreadyDeleted: true })
    }
    console.error('[remove-produto]', err)
    return NextResponse.json({ ok: false, error: err.message || 'Erro desconhecido' }, { status: 500 })
  }
}
