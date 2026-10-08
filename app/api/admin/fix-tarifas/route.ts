/**
 * Fix retroativo: recalcula tarifa_pct_valor (= 12% do total) e tarifa_fixa_valor pra todas as vendas
 *
 * GET /api/admin/fix-tarifas?secret=LUXO2026
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 120

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  const { searchParams } = new URL(req.url)
  const secret = searchParams.get('secret')
  if (secret !== 'LUXO2026' && !auth.startsWith('Basic ')) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Atualiza TODAS as vendas:
    //   tarifa_pct_valor = total * 0.12 (arredondado)
    //   tarifa_fixa_valor = max(0, comissao_seller_valor + bonus_cupom - tarifa_pct_valor)
    // (Só vendas de origem = mercado_livre pra não mexer em outras origens)
    const t0 = Date.now()

    // Update em batch via SQL
    const updated: any = await prisma.$executeRawUnsafe(`
      UPDATE orders
      SET
        tarifa_pct_valor = ROUND(total::numeric * 0.12, 2),
        tarifa_fixa_valor = GREATEST(0, ROUND(
          COALESCE(comissao_seller_valor, 0)
          + COALESCE(bonus_cupom_valor, 0)
          - (total::numeric * 0.12)
        , 2))
      WHERE origem = 'mercado_livre'
        AND total IS NOT NULL
        AND total > 0
    `)

    // Conta quantas vendas atualizadas
    const check: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        COUNT(*)::int as total,
        ROUND(AVG(tarifa_pct_valor / NULLIF(total, 0) * 100), 1)::float as pct_medio_calculado
      FROM orders
      WHERE origem = 'mercado_livre'
        AND total > 0
    `)

    return NextResponse.json({
      ok: true,
      message: 'Tarifas recalculadas pra todas as vendas ML',
      vendas_atualizadas: updated,
      total_vendas_ml: check[0]?.total || 0,
      pct_medio_calculado: check[0]?.pct_medio_calculado || 0,
      duracao_ms: Date.now() - t0,
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}
