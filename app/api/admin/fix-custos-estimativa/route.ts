/**
 * POST /api/admin/fix-custos-estimativa
 *
 * Detecta order_items com custo_unitário que é estimativa 55% do preço
 * (ex: preco=75.17, custo=41.34 = 75.17 * 0.55) e SUBSTITUI pelo custo
 * real cadastrado em product_prices.
 *
 * Body: { company_id?: string, dry_run?: boolean }
 *
 * Se dry_run=true (default), só mostra o que seria alterado, sem alterar.
 * dry_run=false aplica a correção.
 *
 * IMPORTANTE: idempotente (só altera itens com estimativa detectada).
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const companyId = body.company_id || null
    const dryRun = body.dry_run !== false // default true (preview)

// Detecta items com estimativa 55% do preço (tolerância de 0.02 pra float issues)
// Critério: custo_unitario IS NOT NULL
//          AND preco_unitario > 0
//          AND ABS(custo_unitario - preco_unitario * 0.55) < 0.05
    const companyFilter = companyId ? `AND o.company_id = $1::uuid` : ''
    const queryParams: any[] = companyId ? [companyId] : []

    // Encontra items candidatos
    const candidates: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        oi.id::text AS item_id,
        oi.order_id::text AS order_id,
        oi.sku,
        oi.nome_produto,
        oi.quantidade,
        oi.preco_unitario::float AS preco_unitario,
        oi.custo_unitario::float AS custo_unitario_atual,
        (oi.preco_unitario * 0.55)::float AS custo_estimativa_55,
        oi.product_id::text AS product_id,
        pp.custo::float AS custo_real_cadastrado,
        pp.custo IS NOT NULL AS tem_custo_real
      FROM order_items oi
      INNER JOIN orders o ON o.id = oi.order_id
      LEFT JOIN product_prices pp
        ON pp.product_id = oi.product_id
        AND pp.company_id = o.company_id
        AND pp.custo IS NOT NULL
        AND pp.custo > 0
      WHERE oi.custo_unitario IS NOT NULL
        AND oi.preco_unitario > 0
        AND ABS(oi.custo_unitario - (oi.preco_unitario * 0.55)) < 0.05
        ${companyFilter}
      ORDER BY oi.preco_unitario DESC
      LIMIT 5000
    `, ...queryParams)

    // Separa: podem ser corrigidos vs não podem (sem custo real cadastrado)
    const corrigir = candidates.filter(c => c.tem_custo_real)
    const sem_custo_real = candidates.filter(c => !c.tem_custo_real)

    let updated = 0
    if (!dryRun && corrigir.length > 0) {
      // BATCH UPDATE: 1 query só, usando UPDATE ... FROM com JOIN em product_prices
      // SUBSTITUI custo_unitario pelo custo real cadastrado em product_prices,
      // ARREDONDADO pra 2 casas decimais (evita float issues tipo 20.01).
      const result = await prisma.$executeRawUnsafe(`
        UPDATE order_items oi
        SET custo_unitario = ROUND(pp.custo::numeric, 2)
        FROM orders o, product_prices pp
        WHERE oi.order_id = o.id
          AND oi.custo_unitario IS NOT NULL
          AND oi.preco_unitario > 0
          AND ABS(oi.custo_unitario - (oi.preco_unitario * 0.55)) < 0.05
          AND pp.product_id = oi.product_id
          AND pp.company_id = o.company_id
          AND pp.custo IS NOT NULL
          AND pp.custo > 0
          ${companyId ? `AND o.company_id = $1::uuid` : ''}
      `, ...queryParams)
      updated = Number(result) || 0
    }

    return NextResponse.json({
      ok: true,
      dry_run: dryRun,
      total_candidatos: candidates.length,
      corrigir: corrigir.length,
      sem_custo_real_cadastrado: sem_custo_real.length,
      updated: dryRun ? 0 : updated,
      samples_corrigir: corrigir.slice(0, 5).map(c => ({
        sku: c.sku,
        nome: c.nome_produto,
        preco: Number(c.preco_unitario),
        custo_atual_estimativa: Number(c.custo_unitario_atual),
        custo_real_sera_aplicado: Math.round(Number(c.custo_real_cadastrado) * 100) / 100,
      })),
      samples_sem_custo: sem_custo_real.slice(0, 5).map(c => ({
        sku: c.sku,
        nome: c.nome_produto,
        preco: Number(c.preco_unitario),
        custo_estimativa_atual: Number(c.custo_unitario_atual),
      })),
      message: dryRun
        ? `DRY RUN: ${corrigir.length} items seriam corrigidos. Rode com dry_run:false pra aplicar.`
        : `${updated} items corrigidos (custo_unitario substituído pelo real).`,
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}