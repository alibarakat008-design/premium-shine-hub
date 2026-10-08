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
    // Vendas SEM order_items
    const semItems: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        COUNT(*)::int as vendas_sem_items,
        COALESCE(SUM(o.total), 0)::float as receita_sem_items
      FROM orders o
      WHERE o.company_id = $1::uuid
        AND o.origem = 'mercado_livre'::order_origem
        AND o.status != 'cancelado'
        AND NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id)
    `, companyId)

    // Total de order_items
    const totalItems: any[] = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*)::int as total_items
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.company_id = $1::uuid
        AND o.origem = 'mercado_livre'::order_origem
        AND o.status != 'cancelado'
    `, companyId)

    // Vendas com items, mas items SEM product_id
    const itensSemProduct: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        COUNT(DISTINCT o.id)::int as vendas,
        COUNT(*)::int as itens_sem_product_id
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.company_id = $1::uuid
        AND o.origem = 'mercado_livre'::order_origem
        AND o.status != 'cancelado'
        AND oi.product_id IS NULL
    `, companyId)

    return NextResponse.json({
      ok: true,
      vendas_sem_order_items: semItems[0],
      total_items_no_db: totalItems[0]?.total_items || 0,
      vendas_com_items_sem_product_id: itensSemProduct[0],
      insight: 'Vendas SEM order_items = vendas que entraram no DB mas não tiveram items linkados (sync-orders-batch antigo ou falha de link).',
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}
