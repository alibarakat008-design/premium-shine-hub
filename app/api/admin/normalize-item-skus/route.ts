/**
 * Normaliza order_items.sku removendo prefixo "ML-" quando o product sem prefixo existir.
 *
 * Problema: items gravados com prefixo ML-MLBxxxxx mas products sem prefixo.
 *           O JOIN p.sku = oi.sku nao casa, custo_total/find-skus reporta falso positivo.
 *
 * GET  /api/admin/normalize-item-skus?days=120   -> dry-run
 * POST /api/admin/normalize-item-skus?days=120   -> aplica UPDATE nos items
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

async function run(dryRun: boolean, days: number) {
  // Encontra items com prefixo ML- onde existe product SEM prefixo
  const candidates: any[] = await prisma.$queryRawUnsafe(`
    SELECT oi.id AS item_id,
           oi.sku AS sku_com_prefixo,
           p.sku AS sku_sem_prefixo,
           p.nome AS product_nome,
           o.order_number
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    JOIN products p ON p.sku = REPLACE(oi.sku, 'ML-', '')
    LEFT JOIN products p2 ON p2.sku = oi.sku
    WHERE o.origem = 'mercado_livre'
      AND o.created_at > NOW() - (INTERVAL '${Math.max(1, days)} days')
      AND oi.sku LIKE 'ML-%'
      AND p2.id IS NULL
    ORDER BY oi.sku
  `)

  if (candidates.length === 0) {
    return { total_items_desnormalizados: 0, atualizados: 0, dry_run: dryRun, sample: [] }
  }

  if (!dryRun) {
    // 1 query UPDATE com WHERE id IN (...) - rapido
    const itemIds = candidates.map((c) => c.item_id)
    const idsSql = itemIds.map((id) => `'${id}'::uuid`).join(',')
    // UPDATE com CASE WHEN pra mapear cada id pro sku correto
    const caseClauses = candidates.map((c, i) =>
      `WHEN id = '${c.item_id}'::uuid THEN '${c.sku_sem_prefixo}'`,
    ).join(' ')
    await prisma.$executeRawUnsafe(
      `UPDATE order_items SET sku = CASE ${caseClauses} END WHERE id IN (${idsSql})`,
    )
  }

  return {
    total_items_desnormalizados: candidates.length,
    atualizados: candidates.length,
    dry_run: dryRun,
    sample: candidates.slice(0, 30).map((c) => ({
      order_number: c.order_number,
      sku_com_prefixo: c.sku_com_prefixo,
      sku_sem_prefixo: c.sku_sem_prefixo,
      product_nome: c.product_nome,
    })),
  }
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || ''
    if (!authHeader.startsWith('Basic ')) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }
    const { searchParams } = new URL(req.url)
    const days = Number(searchParams.get('days') || 120)
    const r = await run(true, days)
    return NextResponse.json({ ok: true, ...r })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || ''
    if (!authHeader.startsWith('Basic ')) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }
    const { searchParams } = new URL(req.url)
    const days = Number(searchParams.get('days') || 120)
    const r = await run(false, days)
    return NextResponse.json({ ok: true, ...r })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}