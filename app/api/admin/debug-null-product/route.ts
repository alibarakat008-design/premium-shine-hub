// Real distribution of items with product_id IS NULL
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

  try {
    // Items SEM product_id agrupados por NOME (não por product_id)
    const porNome: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        oi.nome_produto,
        COUNT(*)::int as total_items,
        COUNT(DISTINCT o.id)::int as vendas_distintas,
        SUM(oi.quantidade)::int as unidades,
        SUM(oi.preco_unitario * oi.quantidade)::float as receita
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.company_id = $1::uuid
        AND o.origem = 'mercado_livre'::order_origem
        AND o.status != 'cancelado'
        AND oi.product_id IS NULL
      GROUP BY oi.nome_produto
      ORDER BY total_items DESC
      LIMIT 20
    `, companyId)

    return NextResponse.json({
      ok: true,
      items_sem_product_id_por_nome: porNome,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}
