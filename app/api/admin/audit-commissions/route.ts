import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// GET /api/admin/audit-commissions
// Retorna distribuição de comissão % + sample de erradas
export async function GET() {
  try {
    const total: any = await prisma.$queryRawUnsafe(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE comissao_seller_valor IS NULL)::int AS sem_comissao,
        COUNT(*) FILTER (WHERE comissao_seller_valor::numeric = 0)::int AS comissao_zero,
        COUNT(*) FILTER (WHERE subtotal > 0 AND comissao_seller_valor > 0)::int AS com_subtotal,
        COUNT(*) FILTER (WHERE subtotal > 0 AND comissao_seller_valor > 0 AND ABS(comissao_seller_valor::numeric / subtotal::numeric * 100 - 12) <= 0.5)::int AS ok_12pct,
        COUNT(*) FILTER (WHERE subtotal > 0 AND comissao_seller_valor > 0 AND ABS(comissao_seller_valor::numeric / subtotal::numeric * 100 - 12) > 0.5)::int AS erradas,
        COUNT(*) FILTER (WHERE subtotal > 0 AND comissao_seller_valor > 0 AND comissao_seller_valor::numeric / subtotal::numeric * 100 > 13)::int AS acima_13,
        COUNT(*) FILTER (WHERE subtotal > 0 AND comissao_seller_valor > 0 AND comissao_seller_valor::numeric / subtotal::numeric * 100 < 11)::int AS abaixo_11
      FROM orders
      WHERE origem = 'mercado_livre' AND created_at > NOW() - INTERVAL '60 days'
    `)

    const distribuicao: any = await prisma.$queryRawUnsafe(`
      SELECT
        ROUND((comissao_seller_valor::numeric / subtotal::numeric * 100)::numeric, 1) AS pct,
        COUNT(*)::int AS total
      FROM orders
      WHERE origem = 'mercado_livre'
        AND created_at > NOW() - INTERVAL '60 days'
        AND subtotal > 0
        AND comissao_seller_valor > 0
      GROUP BY pct
      ORDER BY total DESC
      LIMIT 30
    `)

    const erradas: any = await prisma.$queryRawUnsafe(`
      SELECT
        order_number,
        subtotal::numeric AS subtotal,
        comissao_seller_valor::numeric AS comissao,
        ROUND((comissao_seller_valor::numeric / NULLIF(subtotal::numeric, 0) * 100)::numeric, 2) AS pct,
        tipo_envio,
        created_at
      FROM orders
      WHERE origem = 'mercado_livre'
        AND created_at > NOW() - INTERVAL '60 days'
        AND subtotal > 0
        AND comissao_seller_valor > 0
        AND ABS(comissao_seller_valor::numeric / subtotal::numeric * 100 - 12) > 0.5
      ORDER BY RANDOM()
      LIMIT 20
    `)

    return NextResponse.json({
      ok: true,
      stats: total[0],
      distribuicao,
      sample_erradas: erradas,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}