/**
 * Conta quantas orders ML ainda têm bonus_envio_valor = 0 ou NULL
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest) {
  const authHeader = _req.headers.get('authorization') || ''
  const { searchParams } = new URL(_req.url)
  const secret = searchParams.get('secret')
  if (secret !== 'LUXO2026' && !authHeader.startsWith('Basic ')) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000)
    const counts = await prisma.$queryRawUnsafe<any[]>(`
      SELECT
        CASE
          WHEN bonus_envio_valor IS NULL THEN 'null'
          WHEN bonus_envio_valor = 0 THEN 'zero'
          ELSE 'maior_zero'
        END as status,
        COUNT(*)::int as total
      FROM orders
      WHERE origem = 'mercado_livre'
        AND created_at >= $1
      GROUP BY 1
    `, since)
  const countsStr = counts.map(c => ({ status: c.status, total: Number(c.total) }))

  // Pega exemplos de vendas que ainda têm bonus_envio = 0 mas precisam atualizar
  const exemplos = await prisma.orders.findMany({
    where: {
      origem: 'mercado_livre',
      created_at: { gte: new Date(Date.now() - 30 * 24 * 3600 * 1000) },
      bonus_envio_valor: 0,
    },
    select: { order_number: true, total: true, comissao_seller_valor: true, recebimento_liquido: true, bonus_envio_valor: true },
    take: 10,
  })

  return NextResponse.json({ ok: true, counts: countsStr, exemplos })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message?.slice(0,500), stack: err.stack?.slice(0,500) }, { status: 500 })
  }
}