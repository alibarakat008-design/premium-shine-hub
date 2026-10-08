import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

const BASIC = 'Basic ' + Buffer.from('premium:shine2026').toString('base64')

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== BASIC) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  const companyId = req.nextUrl.searchParams.get('company_id') || 'e2633570-74da-4b14-9ca1-ba7b0670e612'
  try {
    const r: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        oi.product_id::text as product_id,
        p.sku,
        p.nome as nome_produto,
        COUNT(*)::int as itens,
        pp.id as pp_id,
        pp.custo as pp_custo,
        pp.canal::text as pp_canal
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      JOIN products p ON p.id = oi.product_id
      LEFT JOIN product_prices pp ON pp.product_id = p.id AND pp.company_id = $1::uuid AND pp.canal = 'mercado_livre'::canal_venda
      WHERE o.company_id = $1::uuid
        AND o.origem = 'mercado_livre'::order_origem
        AND o.status != 'cancelado'
        AND oi.product_id IS NOT NULL
        AND (oi.custo_unitario IS NULL OR oi.custo_unitario = 0)
      GROUP BY oi.product_id, p.sku, p.nome, pp.id, pp.custo, pp.canal
      ORDER BY itens DESC
      LIMIT 20
    `, companyId)
    return NextResponse.json({ ok: true, count: r.length, items: r })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message })
  } finally {
    await prisma.$disconnect()
  }
}
