/**
 * POST /api/admin/list-items-by-sku { sku: string }
 *
 * Lista os order_items por SKU, mostrando product_id (NULL ou não)
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const { sku } = await req.json()
    if (!sku) {
      return NextResponse.json({ ok: false, error: 'sku obrigatório' }, { status: 400 })
    }
    const items: any[] = await prisma.$queryRawUnsafe(`
      SELECT oi.id::text, oi.sku, oi.nome_produto,
             oi.quantidade, oi.preco_unitario::float, oi.custo_unitario::float,
             oi.product_id::text AS product_id,
             o.order_number,
             o.company_id::text AS company_id,
             c.nome_fantasia AS company
      FROM order_items oi
      INNER JOIN orders o ON o.id = oi.order_id
      LEFT JOIN companies c ON c.id = o.company_id
      WHERE oi.sku = $1
      ORDER BY o.created_at DESC
      LIMIT 30
    `, sku)
    return NextResponse.json({ ok: true, items, count: items.length })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}