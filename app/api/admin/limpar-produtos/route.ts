// /api/admin/limpar-produtos
// Limpa produtos duplicados/extras das marcas afetadas vs referência
// GET: mostra preview
// GET ?confirm=true: executa
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isMatrizRequest } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

function authCheck(req: NextRequest) {
  if (!isMatrizRequest(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }
  return null
}

// ============================================================
// FASE 4 (01/10/2026): RAYHAAN extras (CORIUM/ELIXIR/NOCTURNO short variants)
// ============================================================
const TO_DELETE = [
  // === RAYHAAN: 3 extras (short variants sem EDP 100ML)
  'ede63c1c-8840-44aa-a064-cfd638b21a42', // extra: CORIUM FOR HIM (ref has CORIUM FOR HIM EDP 100ML)
  'bd4b041d-7314-40ec-bbfa-1e982fb0576b', // extra: ELIXIR (ref has ELIXIR EDP 100ML)
  '5072e1c0-fc6d-473f-8ec0-49d6b7a509fe', // extra: NOCTURNO ELIXIR (ref has NOCTURNO ELIXIR EDP 100ML)
]

export async function GET(req: NextRequest) {
  const authErr = authCheck(req)
  if (authErr) return authErr
  try {
    const { searchParams } = new URL(req.url)
    const execute = searchParams.get('confirm') === 'true'

    if (execute) {
      // Deleta em cascata todas as tabelas com FK product_id (NoAction) via Prisma
      await prisma.order_items.deleteMany({ where: { product_id: { in: TO_DELETE } } })
      await prisma.marketplace_listings.deleteMany({ where: { product_id: { in: TO_DELETE } } })
      await prisma.product_prices.deleteMany({ where: { product_id: { in: TO_DELETE } } })
      await prisma.inventory_movements.deleteMany({ where: { product_id: { in: TO_DELETE } } })
      await prisma.inventory.deleteMany({ where: { product_id: { in: TO_DELETE } } })
      await prisma.price_history.deleteMany({ where: { product_id: { in: TO_DELETE } } })
      await prisma.pricing_rules.deleteMany({ where: { product_id: { in: TO_DELETE } } })
      await prisma.sales_forecasts.deleteMany({ where: { product_id: { in: TO_DELETE } } })
      await prisma.supplier_purchase_items.deleteMany({ where: { product_id: { in: TO_DELETE } } })
      // Tabelas que existem no DB mas não no schema Prisma — usa unnest() pra expandir UUIDs
      const ids = TO_DELETE.map(id => `'${id}'`).join(',')
      try { await prisma.$executeRawUnsafe(`DELETE FROM orders_devolucoes WHERE product_id IN (SELECT unnest(ARRAY[${ids}]::uuid[]))`) } catch {}
      try { await prisma.$executeRawUnsafe(`DELETE FROM orders_returns WHERE product_id IN (SELECT unnest(ARRAY[${ids}]::uuid[]))`) } catch {}
      try { await prisma.$executeRawUnsafe(`DELETE FROM wishlist_items WHERE product_id IN (SELECT unnest(ARRAY[${ids}]::uuid[]))`) } catch {}
      try { await prisma.$executeRawUnsafe(`DELETE FROM shipping_items WHERE product_id IN (SELECT unnest(ARRAY[${ids}]::uuid[]))`) } catch {}
      const result = await prisma.products.deleteMany({ where: { id: { in: TO_DELETE } } })
      return NextResponse.json({
        ok: true,
        deleted: result.count,
        total_ids: TO_DELETE.length,
        message: `${result.count} produtos removidos com sucesso.`,
      })
    }

    const products = await prisma.products.findMany({
      where: { id: { in: TO_DELETE } },
      select: { id: true, sku: true, nome: true, marca_id: true },
    })
    return NextResponse.json({ ok: true, total: products.length, total_ids: TO_DELETE.length, products })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
