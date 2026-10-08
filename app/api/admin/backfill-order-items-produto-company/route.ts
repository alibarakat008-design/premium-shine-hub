/**
 * POST /api/admin/backfill-order-items-produto-company
 *
 * Backfill que LINKA order_items.product_id via marketplace_listings
 * (igual ao /backfill-order-items-produto mas sem restrição de company)
 *
 * Body: { company_id?: string }
 *
 * Estratégia 3-pass:
 *   1) order_items.sku = marketplace_listings.listing_id
 *   2) order_items.sku = products.sku
 *   3) order_items.nome_produto = products.nome
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const companyId = body.company_id
    const companyFilter = companyId ? `AND o.company_id = '${companyId}'::uuid` : ''

    const r1 = await prisma.$executeRawUnsafe(`
      UPDATE order_items oi
      SET product_id = ml.product_id
      FROM orders o, marketplace_listings ml
      WHERE oi.order_id = o.id
        AND oi.product_id IS NULL
        ${companyFilter}
        AND ml.listing_id = oi.sku
        AND ml.product_id IS NOT NULL
    `)
    const r2 = await prisma.$executeRawUnsafe(`
      UPDATE order_items oi
      SET product_id = p.id
      FROM orders o, products p
      WHERE oi.order_id = o.id
        AND oi.product_id IS NULL
        ${companyFilter}
        AND p.sku = oi.sku
    `)
    const r3 = await prisma.$executeRawUnsafe(`
      UPDATE order_items oi
      SET product_id = p.id
      FROM orders o, products p
      WHERE oi.order_id = o.id
        AND oi.product_id IS NULL
        ${companyFilter}
        AND LOWER(TRIM(p.nome)) = LOWER(TRIM(oi.nome_produto))
    `)

    const stillNull: any[] = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*)::int AS total
      FROM order_items oi INNER JOIN orders o ON o.id = oi.order_id
      WHERE oi.product_id IS NULL ${companyFilter}
    `)

    return NextResponse.json({
      ok: true,
      backfill: {
        match_listing_id: Number(r1) || 0,
        match_sku: Number(r2) || 0,
        match_nome: Number(r3) || 0,
      },
      ainda_sem_produto: stillNull[0]?.total || 0,
      company_id: companyId,
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}