/**
 * Detalhe de vendas individuais com TODOS os campos (venda, comissão, frete, custo, lucro)
 * GET /api/admin/vendas-detalhe?q=Armaf%20Club&custo=179&limit=5
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const BASIC = 'Basic ' + Buffer.from('premium:shine2026').toString('base64')
const LIURA_COMPANY = 'e2633570-74da-4b14-9ca1-ba7b0670e612'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== BASIC) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q') || 'Armaf Club'
  const custo = Number(searchParams.get('custo') || 179)
  const limit = Math.max(1, Math.min(Number(searchParams.get('limit') || 5), 50))

  try {
    const where = q.split(/\s+/).map((_, i) => `oi.nome_produto ILIKE $${i + 1}`).join(' AND ')
    const params = q.split(/\s+/).map(t => `%${t}%`)

    const vendas: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        o.order_number,
        o.pack_id,
        o.status,
        o.created_at,
        o.tipo_envio,
        oi.sku,
        oi.nome_produto,
        oi.quantidade,
        oi.preco_unitario::float as preco_unit,
        (oi.quantidade * oi.preco_unitario)::float as venda,
        o.tarifa_pct_valor::float as comissao_pct_valor,
        o.tarifa_fixa_valor::float as comissao_fixa_valor,
        o.comissao_seller_valor::float as comissao_total,
        o.frete::float as frete,
        o.bonus_envio_valor::float as bonus_envio,
        o.bonus_cupom_valor::float as bonus_cupom,
        o.recebimento_liquido::float as recebimento,
        $${params.length + 2}::numeric * oi.quantidade as cmv,
        (o.recebimento_liquido - $${params.length + 2}::numeric * oi.quantidade)::float as lucro,
        CASE
          WHEN o.recebimento_liquido > 0
          THEN ROUND(((o.recebimento_liquido - $${params.length + 2}::numeric * oi.quantidade) / o.recebimento_liquido * 100)::numeric, 1)
          ELSE 0
        END as margem_pct
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE ${where}
        AND o.company_id = $${params.length + 1}::uuid
        AND o.origem = 'mercado_livre'::order_origem
        AND o.status != 'cancelado'
      ORDER BY o.created_at DESC
      LIMIT $${params.length + 3}
    `, ...params, LIURA_COMPANY, custo, limit)

    return NextResponse.json({
      ok: true,
      busca: q,
      custo_unitario: custo,
      vendas,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message, stack: err.stack?.substring(0, 500) }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}
