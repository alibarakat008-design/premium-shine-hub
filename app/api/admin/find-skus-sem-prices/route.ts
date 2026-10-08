/**
 * Verifica se SKUs em items existem como products e tem product_prices.
 * Lista os que NÃO tem product_prices mas TEM custo no item.
 *
 * GET /api/admin/find-skus-sem-prices?days=120&limit=500
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || ''
    if (!authHeader.startsWith('Basic ')) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }
    const { searchParams } = new URL(req.url)
    const days = Number(searchParams.get('days') || 120)
    const limit = Number(searchParams.get('limit') || 500)

    const rows: any[] = await prisma.$queryRawUnsafe(`
      SELECT oi.sku,
             p.id AS product_id,
             p.nome AS product_nome,
             pp.id AS price_id,
             pp.custo AS product_custo,
             COUNT(DISTINCT oi.order_id) AS num_vendas,
             MAX(oi.custo_unitario) AS custo_no_item,
             SUM(COALESCE(oi.custo_unitario, 0) * COALESCE(oi.quantidade, 1)) AS custo_total_items
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      LEFT JOIN products p ON p.sku = oi.sku
      LEFT JOIN product_prices pp ON pp.product_id = p.id AND pp.canal = 'mercado_livre'
      WHERE o.origem = 'mercado_livre'
        AND o.created_at > NOW() - (INTERVAL '${Math.max(1, days)} days')
        AND oi.sku IS NOT NULL
        AND oi.custo_unitario IS NOT NULL
        AND oi.custo_unitario > 0
        AND pp.custo IS NULL
      GROUP BY oi.sku, p.id, p.nome, pp.id, pp.custo
      ORDER BY custo_total_items DESC
      LIMIT ${limit}
    `)

    return NextResponse.json({
      ok: true,
      total_skus: rows.length,
      rows: rows.map((r) => ({
        sku: r.sku,
        product_cadastrado: r.product_id ? {
          id: r.product_id,
          nome: r.product_nome,
        } : null,
        product_price_existe: !!r.price_id,
        custo_no_item: Number(r.custo_unitario),
        num_vendas: Number(r.num_vendas),
        custo_total_items: Number(r.custo_total_items),
      })),
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}