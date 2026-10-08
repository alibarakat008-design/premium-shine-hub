// Conta items NULL vs product NULL
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
  const companyId = req.nextUrl.searchParams.get('company_id') || 'e2633570-74da-4b14-9ca1-ba7b0670e612'
  try {
    const r: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE custo_unitario IS NULL AND product_id IS NULL)::int as ambos_null,
        COUNT(*) FILTER (WHERE custo_unitario IS NULL AND product_id IS NOT NULL)::int as custo_null_com_product,
        COUNT(*) FILTER (WHERE custo_unitario IS NOT NULL AND product_id IS NULL)::int as custo_com_product_null,
        COUNT(*) FILTER (WHERE custo_unitario > 0 AND product_id IS NOT NULL)::int as tem_cust_e_product
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.company_id = $1::uuid
        AND o.origem = 'mercado_livre'::order_origem
        AND o.status != 'cancelado'
    `, companyId)
    return NextResponse.json({ ok: true, ...r[0] })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message })
  } finally {
    await prisma.$disconnect()
  }
}
