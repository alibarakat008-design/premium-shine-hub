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
    // Top 30 produtos com mais vendas, mostrando custo
    const r: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        p.sku, p.nome,
        pp.custo as custo_cadastrado,
        pp.updated_at as custo_updated,
        COUNT(DISTINCT oi.id)::int as itens,
        SUM(oi.quantidade)::int as unidades,
        AVG(oi.preco_unitario)::float as preco_medio,
        AVG(oi.custo_unitario)::float as custo_item_medio
      FROM products p
      JOIN product_prices pp ON pp.product_id = p.id AND pp.company_id = $1::uuid
      LEFT JOIN order_items oi ON oi.product_id = p.id
      LEFT JOIN orders o ON o.id = oi.order_id AND o.company_id = $1::uuid
      WHERE pp.custo > 0
      GROUP BY p.id, p.sku, p.nome, pp.custo, pp.updated_at
      ORDER BY itens DESC NULLS LAST
      LIMIT 30
    `, companyId)
    return NextResponse.json({ ok: true, count: r.length, items: JSON.parse(JSON.stringify(r, (_, v) => typeof v === 'bigint' ? Number(v) : v)) })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message })
  } finally {
    await prisma.$disconnect()
  }
}
