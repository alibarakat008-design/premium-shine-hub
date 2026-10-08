/**
 * DEDUPLICA order_items duplicados (criados pelo refetch)
 * Mantém o item com MAIOR custo_unitario (ou o mais recente se empate)
 *
 * GET /api/admin/dedup-items?secret=LUXO2026&dry_run=true
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

const BASIC = 'Basic ' + Buffer.from('premium:shine2026').toString('base64')
const SECRET = 'LUXO2026'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== BASIC) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }
  if (req.nextUrl.searchParams.get('secret') !== SECRET) {
    return NextResponse.json({ ok: false, error: 'Secret inválido' }, { status: 401 })
  }
  const dryRun = req.nextUrl.searchParams.get('dry_run') === 'true'

  try {
    // Conta quantos items duplicados existem (mesmo order_id + sku)
    const dupCount: any[] = await prisma.$queryRaw`
      WITH dup AS (
        SELECT
          order_id,
          sku,
          COUNT(*)::int as qtd
        FROM order_items
        WHERE sku IS NOT NULL
        GROUP BY order_id, sku
        HAVING COUNT(*) > 1
      )
      SELECT
        COUNT(*)::int as grupos_duplicados,
        SUM(qtd - 1)::int as items_a_deletar
      FROM dup
    `

    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dry_run: true,
        ...dupCount[0],
      })
    }

    // Deleta duplicados: mantém o item com MAIOR custo_unitario (ou ID mais recente)
    const result: any = await prisma.$queryRaw`
      WITH ranked AS (
        SELECT
          id,
          ROW_NUMBER() OVER (
            PARTITION BY order_id, sku
            ORDER BY custo_unitario DESC NULLS LAST, id DESC
          ) as rn
        FROM order_items
        WHERE sku IS NOT NULL
      )
      DELETE FROM order_items
      WHERE id IN (SELECT id FROM ranked WHERE rn > 1)
      RETURNING id
    `

    return NextResponse.json({
      ok: true,
      mensagem: `✅ ${result.length} items duplicados removidos`,
      ...dupCount[0],
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message, stack: err.stack?.substring(0, 500) }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}
