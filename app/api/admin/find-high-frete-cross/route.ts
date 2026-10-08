/**
 * Detecta vendas cross_docking/xd_dropoff/agency com frete possivelmente errado.
 * "Errado" = frete > 30% do total (provavelmente pegou list_cost consolidado)
 *
 * GET /api/admin/find-high-frete-cross?minPct=0.3&days=120
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || ''
    const { searchParams } = new URL(req.url)
    const secret = searchParams.get('secret')
    if (secret !== 'LUXO2026' && !authHeader.startsWith('Basic ')) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }
    const minPct = Number(searchParams.get('minPct') || 0.3)
    const days = Number(searchParams.get('days') || 120)

    const orders: any[] = await prisma.$queryRawUnsafe(`
      SELECT order_number, tipo_envio, total, frete, recebimento_liquido
      FROM orders
      WHERE origem = 'mercado_livre'
        AND tipo_envio IN ('cross_docking', 'xd_dropoff')
        AND created_at > NOW() - (INTERVAL '${Math.max(1, days)} days')
        AND total IS NOT NULL AND total > 0 AND frete IS NOT NULL AND frete > ${minPct}::numeric * total
      ORDER BY created_at DESC
      LIMIT 500
    `)

    return NextResponse.json({
      ok: true,
      min_pct: minPct,
      count: orders.length,
      rows: orders.map((o) => ({
        order_number: o.order_number,
        tipo: o.tipo_envio,
        total: Number(o.total.toString()),
        frete: Number(o.frete.toString()),
        frete_pct: Number(((Number(o.frete.toString()) / Number(o.total.toString())) * 100).toFixed(1)),
        recebimento: Number(o.recebimento_liquido?.toString() ?? 0),
      })),
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}