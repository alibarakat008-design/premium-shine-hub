/**
 * Backfill: remove prefixo "ML-" dos order_number antigos pra ficarem idênticos ao ML
 * Exemplo: "ML-2000017109015786" → "2000017109015786"
 *
 * GET /api/admin/strip-ml-prefix?secret=LUXO2026&batch=500
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || ''
  const { searchParams } = new URL(req.url)
  const secret = searchParams.get('secret')
  if (secret !== 'LUXO2026' && !authHeader.startsWith('Basic ')) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const batch = parseInt(searchParams.get('batch') || '500', 10)

  // Buscar orders com prefixo ML-
  const orders = await prisma.orders.findMany({
    where: {
      origem: 'mercado_livre',
      order_number: { startsWith: 'ML-' },
    },
    select: { id: true, order_number: true },
    take: batch,
  })

  let atualizados = 0
  let erros = 0

  for (const o of orders) {
    const newNumber = o.order_number.replace(/^ML-/, '')
    try {
      await prisma.orders.update({
        where: { id: o.id },
        data: { order_number: newNumber },
      })
      atualizados++
    } catch (e) {
      // Se der unique constraint, pula
      erros++
    }
  }

  return NextResponse.json({
    ok: true,
    encontrados: orders.length,
    atualizados,
    erros,
    amostra: orders.slice(0, 5).map(o => ({
      de: o.order_number,
      para: o.order_number.replace(/^ML-/, ''),
    })),
  })
}