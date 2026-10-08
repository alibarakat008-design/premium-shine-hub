/**
 * Conta items sem custo por produto (com e sem product_prices cadastrado)
 * GET /api/admin/count-itens-sem-custo?company_id=X
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const BASIC = 'Basic ' + Buffer.from('premium:shine2026').toString('base64')

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== BASIC) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }
  const { searchParams } = new URL(req.url)
  const companyId = searchParams.get('company_id') || 'e2633570-74da-4b14-9ca1-ba7b0670e612'

  try {
    // Items sem custo, agrupados por (tem product_prices com custo? sim/não)
    const counts: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        CASE
          WHEN pp.custo > 0 THEN 'TEM_CUSTO_CADASTRADO'
          WHEN pp.custo = 0 THEN 'TEM_PP_CUSTO_ZERO'
          ELSE 'SEM_PP'
        END as status_custo,
        COUNT(*)::int as itens,
        COUNT(DISTINCT oi.product_id)::int as produtos_unicos,
        COALESCE(SUM(oi.quantidade), 0)::int as unidades
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      LEFT JOIN product_prices pp
        ON pp.product_id = oi.product_id
        AND pp.company_id = $1::uuid
      WHERE o.company_id = $1::uuid
        AND o.origem = 'mercado_livre'::order_origem
        AND o.status != 'cancelado'
        AND oi.product_id IS NOT NULL
        AND (oi.custo_unitario IS NULL OR oi.custo_unitario = 0)
      GROUP BY status_custo
      ORDER BY status_custo
    `, companyId)

    // Top 30 produtos com items sem custo (pra mostrar o user)
    const top: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        oi.product_id::text as product_id,
        MAX(p.sku) as sku,
        MAX(oi.nome_produto) as produto,
        COUNT(*)::int as itens,
        SUM(oi.quantidade)::int as unidades,
        COALESCE(MAX(pp.custo), 0)::float as custo_cadastrado_pp,
        MAX(CASE WHEN pp.custo > 0 THEN 'SIM' ELSE 'NAO' END) as tem_pp
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      LEFT JOIN products p ON p.id = oi.product_id
      LEFT JOIN product_prices pp
        ON pp.product_id = oi.product_id
        AND pp.company_id = $1::uuid
      WHERE o.company_id = $1::uuid
        AND o.origem = 'mercado_livre'::order_origem
        AND o.status != 'cancelado'
        AND oi.product_id IS NOT NULL
        AND (oi.custo_unitario IS NULL OR oi.custo_unitario = 0)
      GROUP BY oi.product_id
      ORDER BY itens DESC
      LIMIT 30
    `, companyId)

    return NextResponse.json({
      ok: true,
      company_id: companyId,
      resumo: counts,
      top_30_produtos_sem_custo: top,
      explicacao: 'TEM_CUSTO_CADASTRADO = produto tem custo > 0 em product_prices MAS o item não foi propagado. TEM_PP_CUSTO_ZERO = product_prices existe com custo=0 (registro vazio). SEM_PP = nem tem product_prices cadastrado.',
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message, stack: err.stack?.substring(0, 500) }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}
