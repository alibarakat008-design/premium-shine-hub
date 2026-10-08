/**
 * Debug duplicação de items do Yara Tous + DEDUPLICAÇÃO
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const BASIC = 'Basic ' + Buffer.from('premium:shine2026').toString('base64')
const LIURA = 'e2633570-74da-4b14-9ca1-ba7b0670e612'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== BASIC) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }
  const { searchParams } = new URL(req.url)
  const companyId = searchParams.get('company_id') || LIURA
  const dryRun = searchParams.get('dry_run') === 'true'

  try {
    // 1) Quantos items por produto SEM product_id, COM nome "Yara"
    const yaraItems: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        COUNT(*)::int as total_items,
        COUNT(DISTINCT o.id)::int as vendas_distintas,
        COUNT(DISTINCT oi.sku)::int as skus_distintos,
        COUNT(DISTINCT oi.nome_produto)::int as nomes_distintos
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.company_id = $1::uuid
        AND o.origem = 'mercado_livre'::order_origem
        AND oi.product_id IS NULL
        AND oi.nome_produto ILIKE '%Yara%'
    `, companyId)

    // 2) Items com product_id NULL por ordem de duplicação
    const duplicados: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        o.order_number,
        oi.sku,
        oi.nome_produto,
        COUNT(*)::int as qtd_items,
        MIN(oi.id::text) as first_id,
        MAX(oi.id::text) as last_id
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.company_id = $1::uuid
        AND o.origem = 'mercado_livre'::order_origem
        AND oi.product_id IS NULL
      GROUP BY o.order_number, oi.sku, oi.nome_produto
      HAVING COUNT(*) > 1
      ORDER BY qtd_items DESC
      LIMIT 20
    `, companyId)

    // 3) Total de items duplicados (product_id IS NULL)
    const totalDup: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        COUNT(*)::int as items_com_product_null,
        COUNT(DISTINCT (oi.order_id, oi.sku))::int as distinct_por_order_sku
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.company_id = $1::uuid
        AND o.origem = 'mercado_livre'::order_origem
        AND oi.product_id IS NULL
    `, companyId)

    return NextResponse.json({
      ok: true,
      yara: yaraItems[0],
      duplicados_top_20: duplicados,
      total_items_sem_product: totalDup[0],
      insight_yara: yaraItems[0]?.vendas_distintas < yaraItems[0]?.total_items
        ? `YARA TEM ${yaraItems[0].total_items} ITEMS MAS SÓ ${yaraItems[0].vendas_distintas} VENDAS DISTINTAS — ${yaraItems[0].total_items - yaraItems[0].vendas_distintas} ITEMS DUPLICADOS!`
        : 'Yara não está duplicado',
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}
