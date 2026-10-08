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
        COUNT(*) FILTER (WHERE nome_produto IS NULL)::int as nome_null,
        COUNT(*) FILTER (WHERE nome_produto = '')::int as nome_vazio,
        COUNT(*) FILTER (WHERE nome_produto IS NOT NULL AND nome_produto != '')::int as nome_valido,
        COUNT(DISTINCT nome_produto) FILTER (WHERE nome_produto IS NOT NULL)::int as nomes_distintos,
        COUNT(DISTINCT sku) FILTER (WHERE sku IS NOT NULL)::int as skus_distintos
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.company_id = $1::uuid
        AND o.origem = 'mercado_livre'::order_origem
        AND o.status != 'cancelado'
        AND (oi.custo_unitario IS NULL OR oi.custo_unitario = 0)
    `, companyId)
    return NextResponse.json({ ok: true, ...r[0] })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message })
  } finally {
    await prisma.$disconnect()
  }
}
