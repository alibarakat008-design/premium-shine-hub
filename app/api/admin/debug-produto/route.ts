/**
 * GET /api/admin/debug-produto?sku=X
 *
 * Debug detalhado de um produto: product_prices cadastrados, items com estimativa, etc.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const sku = searchParams.get('sku')
  if (!sku) {
    return NextResponse.json({ ok: false, error: 'sku obrigatório' }, { status: 400 })
  }

  try {
    const prod: any[] = await prisma.$queryRawUnsafe(`
      SELECT p.id::text, p.sku, p.nome, p.marca_id::text AS marca_id, b.nome AS marca
      FROM products p LEFT JOIN brands b ON b.id = p.marca_id
      WHERE p.sku = $1 LIMIT 1
    `, sku)
    if (prod.length === 0) {
      return NextResponse.json({ ok: false, error: 'Produto não encontrado' }, { status: 404 })
    }
    const p = prod[0]

    // Custos cadastrados em product_prices (TODAS as companies)
    const prices: any[] = await prisma.$queryRawUnsafe(`
      SELECT pp.id::text, pp.company_id::text, pp.custo::float AS custo, pp.preco_venda::float AS preco_venda,
             pp.canal::text AS canal, c.nome_fantasia
      FROM product_prices pp LEFT JOIN companies c ON c.id = pp.company_id
      WHERE pp.product_id = $1::uuid
      ORDER BY c.nome_fantasia, pp.canal
    `, p.id)

    // Items com estimativa 55% (todos)
    const itemsEstimativa: any[] = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*)::int AS total, o.company_id::text AS company_id, c.nome_fantasia
      FROM order_items oi
      INNER JOIN orders o ON o.id = oi.order_id
      LEFT JOIN companies c ON c.id = o.company_id
      WHERE oi.sku = $1
        AND oi.custo_unitario IS NOT NULL
        AND oi.preco_unitario > 0
        AND ABS(oi.custo_unitario - (oi.preco_unitario * 0.55)) < 0.05
      GROUP BY o.company_id, c.nome_fantasia
      ORDER BY c.nome_fantasia
    `, sku)

    return NextResponse.json({
      ok: true,
      produto: p,
      product_prices: prices,
      items_com_estimativa_55_pct: itemsEstimativa,
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}