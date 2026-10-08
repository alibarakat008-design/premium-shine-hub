/**
 * Migration: strip prefixo "ML-" de marketplace_listings.listing_id
 * Pra alinhar com order_items.sku e products.sku (que já estão sem prefixo)
 *
 * GET /api/admin/strip-ml-prefix-listings?secret=LUXO2026
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || ''
  const { searchParams } = new URL(req.url)
  const secret = searchParams.get('secret')
  if (secret !== 'LUXO2026' && !authHeader.startsWith('Basic ')) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const t0 = Date.now()

  try {
    const antes = await prisma.$queryRawUnsafe<any[]>(
      `SELECT COUNT(*) as total FROM marketplace_listings WHERE listing_id LIKE 'ML-%'`
    )
    const total = Number(antes[0]?.total || 0)

    if (total === 0) {
      return NextResponse.json({ ok: true, mensagem: 'Nada para atualizar', total: 0 })
    }

    const result = await prisma.$executeRawUnsafe(
      `UPDATE marketplace_listings SET listing_id = SUBSTRING(listing_id FROM 4) WHERE listing_id LIKE 'ML-%' AND LENGTH(listing_id) > 3`
    )

    const depois = await prisma.$queryRawUnsafe<any[]>(
      `SELECT COUNT(*) as total FROM marketplace_listings WHERE listing_id LIKE 'ML-%'`
    )

    return NextResponse.json({
      ok: true,
      atualizados: result,
      total_antes: total,
      total_depois_com_prefixo: Number(depois[0]?.total || 0),
      duracao_ms: Date.now() - t0,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}