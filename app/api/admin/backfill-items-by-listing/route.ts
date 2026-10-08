/**
 * Backfill: vincula order_items.product_id via marketplace_listings
 *
 * O sync-orders-batch salva oi.sku = MLM_ID (ex: MLB5542462698),
 * mas products.sku é o SKU interno (ex: ASAD-15ML).
 * Esse endpoint linka via marketplace_listings.listing_id = oi.sku.
 *
 * GET /api/admin/backfill-items-by-listing?secret=LUXO2026
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || ''
  const { searchParams } = new URL(req.url)
  const secret = searchParams.get('secret')
  if (secret !== 'LUXO2026' && !authHeader.startsWith('Basic ')) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const t0 = Date.now()

  try {
    // UPDATE: order_items.product_id = marketplace_listings.product_id
    // quando oi.sku = ml.listing_id
    const result = await prisma.$executeRawUnsafe(`
      UPDATE order_items oi
      SET product_id = ml.product_id
      FROM marketplace_listings ml,
           orders o
      WHERE oi.order_id = o.id
        AND o.marketplace_account_id = ml.account_id
        AND ml.listing_id = oi.sku
        AND oi.product_id IS NULL
        AND ml.product_id IS NOT NULL
    `)

    // Conta quantos restaram sem link (que tem sku preenchido)
    const restantes: any[] = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*)::int as total_sem_link
      FROM order_items oi
      WHERE oi.product_id IS NULL
        AND LENGTH(COALESCE(oi.sku, '')) > 0
    `)

    // Conta quantos foram linkados por empresa
    const porEmpresa: any[] = await prisma.$queryRawUnsafe(`
      SELECT c.nome_fantasia, COUNT(oi.id)::int as linkados
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      JOIN companies c ON c.id = o.company_id
      WHERE oi.product_id IS NOT NULL
      GROUP BY c.nome_fantasia
      ORDER BY linkados DESC
    `)

    return NextResponse.json({
      ok: true,
      linkados_nesta_rodada: result,
      total_sem_link_com_sku: restantes[0]?.total_sem_link || 0,
      por_empresa: porEmpresa,
      duracao_ms: Date.now() - t0,
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}
