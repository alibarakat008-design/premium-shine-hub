/**
 * Debug: comparar 15 vs 615
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
    // Versão simplificada da query DRE
    const r: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        COUNT(*)::int as total_vendas,
        COUNT(*) FILTER (WHERE NOT EXISTS (
          SELECT 1 FROM order_items oi2
          WHERE oi2.order_id = o.id
            AND oi2.custo_unitario > 0
        ))::int as vendas_sem_custo_nenhum
      FROM orders o
      WHERE o.company_id = $1::uuid
        AND o.origem = 'mercado_livre'::order_origem
        AND o.status != 'cancelado'
    `, companyId)

    // Versão com EXISTS
    const r2: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        COUNT(*)::int as total_vendas,
        COUNT(*) FILTER (WHERE EXISTS (
          SELECT 1 FROM order_items oi2
          WHERE oi2.order_id = o.id
            AND oi2.product_id IS NOT NULL
            AND (oi2.custo_unitario IS NULL OR oi2.custo_unitario = 0)
        ))::int as vendas_com_item_null
      FROM orders o
      WHERE o.company_id = $1::uuid
        AND o.origem = 'mercado_livre'::order_origem
        AND o.status != 'cancelado'
    `, companyId)

    return NextResponse.json({
      ok: true,
      vendas_sem_custo_nenhum: r[0],
      vendas_com_item_null: r2[0],
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}
