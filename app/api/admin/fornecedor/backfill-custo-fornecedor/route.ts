/**
 * Backfill custo_fornecedor = custo (assumindo que inicialmente são iguais)
 * Depois o user pode editar via /admin/meus-custos se necessário.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || ''
    if (!authHeader.startsWith('Basic ')) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }

    // Backfill: copia custo -> custo_fornecedor onde custo_fornecedor é 0 ou NULL
    const r: any = await prisma.$queryRawUnsafe(`
      UPDATE product_prices
      SET custo_fornecedor = custo
      WHERE (custo_fornecedor IS NULL OR custo_fornecedor = 0)
        AND custo IS NOT NULL
        AND custo > 0
    `)
    return NextResponse.json({ ok: true, updated: r })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  return POST(req)
}
