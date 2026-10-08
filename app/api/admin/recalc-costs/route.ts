// Recalcula order_items.custo_unitario a partir de product_prices.custo
// (do canal correto). Resolve o problema de "importei custo mas outras abas
// não mostram o mesmo valor".
//
// Uso: GET /api/admin/recalc-costs?secret=LUXO2026
//
// Estratégia: 1 SQL UPDATE com JOIN, atualiza TUDO de uma vez.
// Onde: order_items.order_id → orders.origem (define o canal)
//       order_items.product_id → product_prices (canal = orders.origem)

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  if (searchParams.get('secret') !== 'LUXO2026') {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const t0 = Date.now()

  try {
    // SQL bulk: atualiza order_items.custo_unitario com base no product_prices
    // do mesmo canal da order. Usa COALESCE pra fallback no product_prices
    // do canal mais barato se não tiver do canal exato.
    const result = await prisma.$executeRawUnsafe(`
      WITH custos AS (
        SELECT oi.id AS oi_id,
          COALESCE(
            (SELECT pp.custo FROM product_prices pp
             WHERE pp.product_id = oi.product_id
               AND pp.canal = o.origem
             LIMIT 1),
            (SELECT pp.custo FROM product_prices pp
             WHERE pp.product_id = oi.product_id
             ORDER BY pp.custo DESC LIMIT 1),
            0
          ) AS novo_custo
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE oi.product_id IS NOT NULL
      )
      UPDATE order_items oi
      SET custo_unitario = c.novo_custo
      FROM custos c
      WHERE oi.id = c.oi_id
    `)

    const duracao = Date.now() - t0

    return NextResponse.json({
      ok: true,
      message: `✅ ${Number(result) || 0} order_items atualizados em ${duracao}ms`,
      updated: Number(result) || 0,
      duracao_ms: duracao,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
