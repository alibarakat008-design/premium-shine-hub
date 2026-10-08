/**
 * Adiciona coluna tipo_envio em orders
 * - 'fulfillment' = FULL (estoque do ML, frete ML desconta)
 * - 'self_service' = FLEX (vendedor paga carrier à parte, ML não desconta)
 * - 'me2' / 'me1' = Mercado Envios (ML desconta frete)
 * - 'drop_off' / 'xd_drop_off' = Coleta
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
    "ALTER TABLE orders ADD COLUMN IF NOT EXISTS tipo_envio VARCHAR(30)",
    "CREATE INDEX IF NOT EXISTS orders_tipo_envio_idx ON orders (tipo_envio, created_at DESC)",
    // Campo editável pra custo médio do FLEX (R$13,90 padrão — pode mudar por carrier)
    "ALTER TABLE orders ADD COLUMN IF NOT EXISTS custo_flex NUMERIC(10,2)",
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