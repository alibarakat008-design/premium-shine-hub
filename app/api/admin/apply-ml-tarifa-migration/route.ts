/**
 * Migration: adiciona campos pra decompor a comissão do ML
 * - bonus_envio_valor: bônus por envio (vem do shipment base_cost - list_cost)
 * - bonus_cupom_valor: cupom + bônus implícito (vem do orders.desconto, MENOS bonus_envio)
 * - tarifa_pct_valor: tarifa cheia de 12% (calculável)
 * - tarifa_fixa_valor: custo fixo do ML (calculável)
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

  const statements = [
    'ALTER TABLE orders ADD COLUMN IF NOT EXISTS bonus_envio_valor NUMERIC(10,2)',
    'ALTER TABLE orders ADD COLUMN IF NOT EXISTS bonus_cupom_valor NUMERIC(10,2)',
    'ALTER TABLE orders ADD COLUMN IF NOT EXISTS tarifa_pct_valor NUMERIC(10,2)',
    'ALTER TABLE orders ADD COLUMN IF NOT EXISTS tarifa_fixa_valor NUMERIC(10,2)',
  ]

  const results: any[] = []
  for (const sql of statements) {
    try {
      await prisma.$executeRawUnsafe(sql)
      results.push({ sql: sql.slice(0, 100), ok: true })
    } catch (err: any) {
      results.push({ sql: sql.slice(0, 100), ok: false, error: err.message.slice(0, 200) })
    }
  }

  return NextResponse.json({ ok: true, statements: results })
}