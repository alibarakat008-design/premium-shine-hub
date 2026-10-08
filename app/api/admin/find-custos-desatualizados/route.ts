/**
 * Diagnostico: detecta vendas onde o CUSTO do item != custo atual do product_prices
 * (custo desatualizado no item OU custo_total zerado na venda).
 *
 * GET /api/admin/find-custos-desatualizados?days=120&limit=200
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const dec = (d: any) => (d ? Number(d.toString()) : 0)

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || ''
    const { searchParams } = new URL(req.url)
    const secret = searchParams.get('secret')
    if (secret !== 'LUXO2026' && !authHeader.startsWith('Basic ')) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }
    const days = Number(searchParams.get('days') || 120)
    const limit = Math.min(2000, Number(searchParams.get('limit') || 200))
    const offset = Number(searchParams.get('offset') || 0)

    // Vendas com items que tem custo_unitario DIFERENTE do product_prices.custo atual
    // OU vendas com custo_total NULL
    const rows: any[] = await prisma.$queryRawUnsafe(`
      SELECT o.id AS order_id, o.order_number, o.tipo_envio, o.custo_total,
             oi.sku, oi.custo_unitario AS item_custo, pp.custo AS product_custo,
             pp.custo IS NULL AS no_price
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      LEFT JOIN products p ON p.sku = oi.sku
      LEFT JOIN product_prices pp ON pp.product_id = p.id AND pp.canal = 'mercado_livre'
      WHERE o.origem = 'mercado_livre'
        AND o.created_at > NOW() - (INTERVAL '${Math.max(1, days)} days')
        AND oi.sku IS NOT NULL
        AND (
          o.custo_total IS NULL
          OR (pp.custo IS NOT NULL AND (oi.custo_unitario IS NULL OR oi.custo_unitario != pp.custo))
          OR (oi.custo_unitario IS NOT NULL AND pp.custo IS NULL)
        )
      ORDER BY o.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `)

    const vendasAgrupadas = new Map<string, any>()
    for (const r of rows) {
      const k = r.order_id
      if (!vendasAgrupadas.has(k)) {
        vendasAgrupadas.set(k, {
          order_id: r.order_id,
          order_number: r.order_number,
          tipo_envio: r.tipo_envio,
          custo_total_atual: dec(r.custo_total),
          itens: [],
        })
      }
      vendasAgrupadas.get(k).itens.push({
        sku: r.sku,
        item_custo: dec(r.item_custo),
        product_custo: dec(r.product_custo),
        divergente: dec(r.item_custo) !== dec(r.product_custo),
      })
    }
    const vendas = Array.from(vendasAgrupadas.values())

    return NextResponse.json({
      ok: true,
      total_vendas: vendas.length,
      total_rows: rows.length,
      offset,
      vendas: vendas.slice(0, 100),
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}