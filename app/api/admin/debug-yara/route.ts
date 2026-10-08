// Quantos items "Yara" existem
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

const BASIC = 'Basic ' + Buffer.from('premium:shine2026').toString('base64')
const LIURA = 'e2633570-74da-4b14-9ca1-ba7b0670e612'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== BASIC) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const yara: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        oi.nome_produto,
        COUNT(*)::int as items,
        COUNT(DISTINCT o.id)::int as vendas
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.company_id = $1::uuid
        AND o.origem = 'mercado_livre'::order_origem
        AND o.status != 'cancelado'
        AND oi.nome_produto ILIKE '%Yara%'
      GROUP BY oi.nome_produto
      ORDER BY items DESC
    `, LIURA)

    return NextResponse.json({
      ok: true,
      total: yara.reduce((s, y) => s + y.items, 0),
      vendas_total: yara.reduce((s, y) => s + y.vendas, 0),
      por_nome: yara,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}
