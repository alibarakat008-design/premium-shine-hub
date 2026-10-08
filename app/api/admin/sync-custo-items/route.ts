/**
 * Propaga o custo atual de product_prices pra TODOS os order_items.
 *
 * REGRAS DE PRIORIDADE (escolhe o product_prices "correto" pra cada item):
 *   1. company_id da venda == product_prices.company_id  (mesma empresa)
 *   2. canal = 'mercado_livre' (origem ML)
 *   3. canal = 'manual' (fallback)
 *   4. so aplica se custo > 0
 *
 * IMPORTANTE: order_items.sku = NOME (NÃO MLB ID). Pra fazer o JOIN certo:
 *   - order_items.product_id (FK) → products.id → product_prices.product_id
 *
 * Tambem recalcula orders.custo_total no mesmo passe.
 *
 * GET  /api/admin/sync-custo-items   -> dry-run
 * POST /api/admin/sync-custo-items   -> aplica (BULK SQL)
 *      ?days=120&limit=10000&offset=0
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const dec = (d: any) => (d ? Number(d.toString()) : 0)

async function run(dryRun: boolean, days: number, offset: number, batch: number) {
  // 1) Pega items que tem product_prices com custo > 0
  //    + ja determina qual product_custo cada um deve receber (via LATERAL)
  //    JOIN via order_items.product_id → products.id → product_prices.product_id
  const rows: any[] = await prisma.$queryRawUnsafe(`
    SELECT
      oi.id AS item_id,
      oi.order_id,
      oi.sku,
      oi.nome_produto,
      oi.quantidade,
      oi.custo_unitario AS item_custo,
      pc.product_custo,
      pc.canal,
      pc.prioridade,
      o.order_number
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    JOIN LATERAL (
      SELECT pp.custo AS product_custo, pp.canal,
        CASE
          WHEN pp.company_id = o.company_id AND pp.canal = 'mercado_livre' THEN 1
          WHEN pp.company_id = o.company_id AND pp.canal = 'manual'        THEN 2
          WHEN pp.canal = 'mercado_livre'                                  THEN 3
          WHEN pp.canal = 'manual'                                         THEN 4
          ELSE 99
        END AS prioridade
      FROM product_prices pp
      WHERE pp.product_id = oi.product_id
        AND pp.custo IS NOT NULL
        AND pp.custo > 0
        AND pp.canal IN ('mercado_livre', 'manual')
      ORDER BY prioridade ASC
      LIMIT 1
    ) pc ON true
    WHERE o.origem = 'mercado_livre'
      AND o.created_at > NOW() - (INTERVAL '${Math.max(1, days)} days')
      AND oi.product_id IS NOT NULL
    ORDER BY o.created_at DESC
    LIMIT ${batch} OFFSET ${offset}
  `)

  if (rows.length === 0) {
    return { total: 0, atualizadas_items: 0, vendas_recalculadas: 0, dry_run: dryRun, offset, sample: [] }
  }

  // 2) BULK UPDATE via CTE
  const itemIds = rows.map((r) => r.item_id)
  const itemsSql = itemIds.map((id) => `'${id}'::uuid`).join(',')
  if (!dryRun) {
    await prisma.$executeRawUnsafe(`
      WITH custo_correto AS (
        SELECT DISTINCT ON (oi.id)
          oi.id AS item_id,
          pc.product_custo
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        JOIN LATERAL (
          SELECT pp.custo AS product_custo,
            CASE
              WHEN pp.company_id = o.company_id AND pp.canal = 'mercado_livre' THEN 1
              WHEN pp.company_id = o.company_id AND pp.canal = 'manual'        THEN 2
              WHEN pp.canal = 'mercado_livre'                                  THEN 3
              WHEN pp.canal = 'manual'                                         THEN 4
              ELSE 99
            END AS prioridade
          FROM product_prices pp
          WHERE pp.product_id = oi.product_id
            AND pp.custo IS NOT NULL
            AND pp.custo > 0
            AND pp.canal IN ('mercado_livre', 'manual')
          ORDER BY prioridade ASC
          LIMIT 1
        ) pc ON true
        WHERE oi.id IN (${itemsSql})
        ORDER BY oi.id, pc.prioridade ASC
      )
      UPDATE order_items
      SET custo_unitario = custo_correto.product_custo
      FROM custo_correto
      WHERE order_items.id = custo_correto.item_id
    `)
  }

  // 3) Recalcula orders.custo_total das vendas afetadas
  const orderIds = Array.from(new Set(rows.map((r) => r.order_id)))
  let vendasRecalc = 0
  if (!dryRun && orderIds.length > 0) {
    const itemsAgg: any[] = await prisma.$queryRawUnsafe(`
      SELECT order_id,
             COALESCE(SUM(COALESCE(custo_unitario, 0) * COALESCE(quantidade, 0)), 0) AS ct
      FROM order_items
      WHERE order_id IN (${orderIds.map((id) => `'${id}'::uuid`).join(',')})
      GROUP BY order_id
    `)
    if (itemsAgg.length > 0) {
      const valuesSql = itemsAgg
        .map((_, i) => `($${i * 2 + 1}::uuid, $${i * 2 + 2}::numeric)`)
        .join(',')
      const params = itemsAgg.flatMap((r) => [r.order_id, Number(Number(r.ct).toFixed(2))])
      await prisma.$executeRawUnsafe(
        `UPDATE orders AS o SET custo_total = v.ct
         FROM (VALUES ${valuesSql}) AS v(id, ct)
         WHERE o.id = v.id`,
        ...params,
      )
      vendasRecalc = itemsAgg.length
    }
  }

  // Sample
  const vendasAgrupadas = new Map<string, any>()
  for (const r of rows) {
    const k = r.order_id
    if (!vendasAgrupadas.has(k)) {
      vendasAgrupadas.set(k, { order_number: r.order_number, itens: [] })
    }
    vendasAgrupadas.get(k).itens.push({
      sku: r.sku,
      antes: dec(r.item_custo),
      depois: dec(r.product_custo),
      origem: r.prioridade === 1 ? 'ML+mesma_empresa' : r.prioridade === 2 ? 'manual+mesma_empresa' : r.prioridade === 3 ? 'ML+outra_empresa' : 'manual+outra_empresa',
    })
  }
  const sample = Array.from(vendasAgrupadas.values()).slice(0, 50)

  return {
    total: rows.length,
    atualizadas_items: rows.length,
    vendas_recalculadas: vendasRecalc,
    dry_run: dryRun,
    offset,
    sample,
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
    const offset = Number(searchParams.get('offset') || 0)
    const batch = Number(searchParams.get('limit') || 2000)
    const r = await run(true, days, offset, batch)
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
    const offset = Number(searchParams.get('offset') || 0)
    const batch = Number(searchParams.get('limit') || 2000)
    const r = await run(false, days, offset, batch)
    return NextResponse.json({ ok: true, ...r })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
