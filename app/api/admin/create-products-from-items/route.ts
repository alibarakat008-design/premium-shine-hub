/**
 * Cria products + product_prices pros SKUs que tem custo no item mas nao tem product.
 *
 * GET  /api/admin/create-products-from-items?days=120   -> dry-run
 * POST /api/admin/create-products-from-items?days=120   -> aplica
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

async function run(dryRun: boolean, days: number) {
  // Para cada sku distinto com custo no item mas SEM product vinculado,
  // cria um product novo + product_prices (mercado_livre) com o custo médio do item.
  // O nome vem do `order_items.nome_produto` (salvo pelo sync ML).
  const rows: any[] = await prisma.$queryRawUnsafe(`
    SELECT oi.sku,
           MAX(oi.nome_produto) AS nome,
           MAX(oi.custo_unitario) AS custo,
           COUNT(DISTINCT oi.order_id) AS num_vendas,
           SUM(COALESCE(oi.custo_unitario, 0) * COALESCE(oi.quantidade, 1)) AS custo_total
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    LEFT JOIN products p ON p.sku = oi.sku
    WHERE o.origem = 'mercado_livre'
      AND o.created_at > NOW() - (INTERVAL '${Math.max(1, days)} days')
      AND oi.sku IS NOT NULL
      AND oi.custo_unitario IS NOT NULL
      AND oi.custo_unitario > 0
      AND p.id IS NULL
    GROUP BY oi.sku
    ORDER BY custo_total DESC
  `)

  const created: any[] = []
  if (!dryRun) {
    for (const r of rows) {
      const sku = r.sku
      const nome = r.nome || sku
      const custo = Number(r.custo)
      // Cria product (sem prefixo ML-)
      const skuClean = sku.replace(/^ML-/, '')
      const product = await prisma.products.upsert({
        where: { sku: skuClean },
        update: { nome },
        create: {
          sku: skuClean,
          nome,
          ativo: true,
          publicado_site: false,
          publicado_shopee: false,
        },
      })
      // Cria/atualiza product_prices
      const pp = await prisma.product_prices.findFirst({
        where: { product_id: product.id, canal: 'mercado_livre' },
      })
      if (pp) {
        await prisma.product_prices.update({ where: { id: pp.id }, data: { custo } })
      } else {
        await prisma.product_prices.create({
          data: {
            product_id: product.id,
            canal: 'mercado_livre',
            custo,
            preco_venda: 0,
          },
        })
      }
      created.push({ sku, sku_clean: skuClean, nome, custo, num_vendas: Number(r.num_vendas) })
    }
  }

  return {
    total_skus_sem_product: rows.length,
    criados: created.length,
    dry_run: dryRun,
    sample: rows.slice(0, 30).map((r) => ({
      sku: r.sku,
      nome: r.nome,
      custo: Number(r.custo),
      num_vendas: Number(r.num_vendas),
      custo_total: Number(r.custo_total),
    })),
    criados_detalhe: created,
  }
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || ''
    if (!authHeader.startsWith('Basic ')) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }
    const { searchParams } = new URL(req.url)
    const days = Number(searchParams.get('days') || 120)
    const r = await run(true, days)
    return NextResponse.json({ ok: true, ...r })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || ''
    if (!authHeader.startsWith('Basic ')) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }
    const { searchParams } = new URL(req.url)
    const days = Number(searchParams.get('days') || 120)
    const r = await run(false, days)
    return NextResponse.json({ ok: true, ...r })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}