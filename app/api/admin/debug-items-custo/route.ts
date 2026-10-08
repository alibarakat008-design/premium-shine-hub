/**
 * Debug do DRE: por que "vendas_sem_custo" = 5.061 quando só 15 items estão sem custo?
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
    // Quantos items totais (com e sem custo)
    const totals: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        COUNT(*)::int as total_items,
        COUNT(*) FILTER (WHERE custo_unitario IS NULL)::int as custo_null,
        COUNT(*) FILTER (WHERE custo_unitario = 0)::int as custo_zero,
        COUNT(*) FILTER (WHERE custo_unitario > 0)::int as custo_positivo,
        COUNT(*) FILTER (WHERE custo_unitario IS NULL OR custo_unitario = 0)::int as sem_custo
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.company_id = $1::uuid
        AND o.origem = 'mercado_livre'::order_origem
        AND o.status != 'cancelado'
        AND oi.product_id IS NOT NULL
    `, companyId)

    // Quantas vendas têm items com NULL/0
    const vendasComNull: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        COUNT(DISTINCT o.id)::int as vendas_com_item_null
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      WHERE o.company_id = $1::uuid
        AND o.origem = 'mercado_livre'::order_origem
        AND o.status != 'cancelado'
        AND oi.product_id IS NOT NULL
        AND (oi.custo_unitario IS NULL OR oi.custo_unitario = 0)
    `, companyId)

    return NextResponse.json({
      ok: true,
      totals: totals[0],
      vendas_com_item_null_zero: vendasComNull[0]?.vendas_com_item_null,
      insight: 'Se total_items é 5000 e custo_null=15, então 99% dos items TÊM custo > 0. As 5.061 vendas "sem custo" do DRE devem ser vendas onde TODOS os items têm custo=0 ou NULL.',
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}
