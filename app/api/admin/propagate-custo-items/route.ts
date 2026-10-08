/**
 * Recalcula custo_unitario em order_items baseado no product_prices.custo
 * Roda retroativo: pra cada item com custo_unitario NULL/0, busca o custo do produto
 *
 * GET /api/admin/propagate-custo-items?secret=LUXO2026&company_id=X&dry_run=true
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
  const { searchParams } = new URL(req.url)
  if (searchParams.get('secret') !== SECRET) {
    return NextResponse.json({ ok: false, error: 'Secret inválido' }, { status: 401 })
  }
  const companyId = searchParams.get('company_id') || 'e2633570-74da-4b14-9ca1-ba7b0670e612'
  const dryRun = searchParams.get('dry_run') === 'true'

  try {
    // Conta quantos items seriam atualizados
    const count: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        COUNT(*)::int as total_sem_custo,
        COUNT(DISTINCT oi.product_id)::int as produtos_unicos,
        SUM(oi.quantidade)::int as unidades_sem_custo
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.company_id = $1::uuid
        AND o.origem = 'mercado_livre'::order_origem
        AND o.status != 'cancelado'
        AND oi.product_id IS NOT NULL
        AND (oi.custo_unitario IS NULL OR oi.custo_unitario = 0)
    `, companyId)

    const c = count[0] || {}

    if (dryRun) {
      // Amostra: top 30 produtos com mais items sem custo
      const sample: any[] = await prisma.$queryRawUnsafe(`
        SELECT
          oi.product_id::text as product_id,
          MAX(p.sku) as sku,
          MAX(oi.nome_produto) as produto,
          COUNT(*)::int as itens,
          SUM(oi.quantidade)::int as unidades,
          COALESCE(MAX(pp.custo), 0)::float as custo_cadastrado
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        LEFT JOIN products p ON p.id = oi.product_id
        LEFT JOIN product_prices pp
          ON pp.product_id = oi.product_id
          AND pp.company_id = $1::uuid
          AND pp.custo > 0
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
        dry_run: true,
        total_itens_sem_custo: c.total_sem_custo || 0,
        produtos_unicos: c.produtos_unicos || 0,
        unidades_sem_custo: c.unidades_sem_custo || 0,
        amostra_30_produtos: sample,
        mensagem: 'Se o custo_cadastrado > 0, esse item PODE ser atualizado.',
      })
    }

    // Atualiza: copia product_prices.custo → order_items.custo_unitario
    // onde o item tá sem custo E o produto TEM custo cadastrado
    const update = await prisma.$executeRawUnsafe(`
      UPDATE order_items oi
      SET custo_unitario = pp.custo
      FROM orders o, product_prices pp
      WHERE o.id = oi.order_id
        AND pp.product_id = oi.product_id
        AND pp.company_id = $1::uuid
        AND pp.custo > 0
        AND o.company_id = $1::uuid
        AND o.origem = 'mercado_livre'::order_origem
        AND o.status != 'cancelado'
        AND oi.product_id IS NOT NULL
        AND (oi.custo_unitario IS NULL OR oi.custo_unitario = 0)
    `, companyId)

    return NextResponse.json({
      ok: true,
      mensagem: `✅ ${update} order_items atualizados com custo do product_prices`,
      itens_antes_sem_custo: c.total_sem_custo || 0,
      itens_atualizados: update,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message, stack: err.stack?.substring(0, 500) }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}
