import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

const BASIC = 'Basic ' + Buffer.from('premium:shine2026').toString('base64')

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== BASIC) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }
  try {
    // Quantos items com sku="MLB..." vs outros (filtrado por company)
    const companyId = req.nextUrl.searchParams.get('company_id') || 'e2633570-74da-4b14-9ca1-ba7b0670e612'
    const r: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE sku ~ '^MLB[0-9]+$')::int as sku_mlb,
        COUNT(*) FILTER (WHERE sku IS NULL)::int as sku_null,
        COUNT(*) FILTER (WHERE sku IS NOT NULL AND sku !~ '^MLB[0-9]+$')::int as sku_outros,
        COUNT(DISTINCT sku)::int as skus_unicos,
        COUNT(*) FILTER (WHERE product_id IS NULL)::int as sem_product_id,
        COUNT(*) FILTER (WHERE custo_unitario IS NULL OR custo_unitario = 0)::int as sem_custo
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.company_id = $1::uuid
        AND o.origem = 'mercado_livre'::order_origem
        AND o.status != 'cancelado'
    `, companyId)

    return NextResponse.json({
      ok: true,
      items: r[0],
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}
