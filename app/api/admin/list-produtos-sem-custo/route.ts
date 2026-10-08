/**
 * Lista produtos que TEM vendas MAS NÃO TÊM custo cadastrado
 */
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
    const produtos: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        oi.product_id::text as product_id,
        MAX(p.sku) as sku,
        MAX(oi.nome_produto) as nome,
        COUNT(DISTINCT o.id)::int as vendas,
        SUM(oi.quantidade)::int as unidades,
        SUM(oi.preco_unitario * oi.quantidade)::float as receita
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      LEFT JOIN products p ON p.id = oi.product_id
      WHERE o.company_id = $1::uuid
        AND o.origem = 'mercado_livre'::order_origem
        AND o.status != 'cancelado'
        AND (oi.custo_unitario IS NULL OR oi.custo_unitario = 0)
      GROUP BY oi.product_id
      ORDER BY vendas DESC
      LIMIT 30
    `, companyId)

    return NextResponse.json({
      ok: true,
      total_produtos: produtos.length,
      produtos,
      mensagem: 'Estes são os produtos que AINDA não têm custo cadastrado. Quando cadastrar, o CMV vai subir e o lucro vai cair (mais realista).',
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}
