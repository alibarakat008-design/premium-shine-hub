/**
 * Backfill FINAL: vincula order_items.product_id direto via products.sku
 * (sem precisar de marketplace_listings como intermediário)
 *
 * GET /api/admin/backfill-items-by-sku?secret=LUXO2026&limit=500
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || ''
  const { searchParams } = new URL(req.url)
  const secret = searchParams.get('secret')
  if (secret !== 'LUXO2026' && !authHeader.startsWith('Basic ')) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const t0 = Date.now()

  try {
    // UPDATE direto via SQL: order_items.product_id = products.id quando SKUs batem
    const result = await prisma.$executeRawUnsafe(`
      UPDATE order_items oi
      SET product_id = p.id
      FROM products p
      WHERE oi.product_id IS NULL
        AND oi.sku = p.sku
        AND LENGTH(oi.sku) > 0
    `)

    // Conta quantos ainda sobraram sem link
    const restantes = await prisma.$queryRawUnsafe<any[]>(`
      SELECT COUNT(*) as total
      FROM order_items oi
      WHERE oi.product_id IS NULL
        AND LENGTH(oi.sku) > 0
    `)

    return NextResponse.json({
      ok: true,
      atualizados: result,
      restantes_sem_link: Number(restantes[0]?.total || 0),
      duracao_ms: Date.now() - t0,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}