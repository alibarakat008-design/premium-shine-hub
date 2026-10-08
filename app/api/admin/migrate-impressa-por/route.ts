/**
 * Migration: rastreia QUEM imprimiu a etiqueta (parceiro que pegou).
 * - orders.impressa_por_company_id (FK companies)
 * - orders.impressa_por_user_id (FK users)
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const results: string[] = []

    await prisma.$queryRawUnsafe(`
      ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS impressa_por_company_id UUID
    `).catch((e: any) => { throw new Error('impressa_por_company_id: ' + e.message) })
    results.push('orders.impressa_por_company_id OK')

    await prisma.$queryRawUnsafe(`
      ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS impressa_por_user_id UUID
    `).catch((e: any) => { throw new Error('impressa_por_user_id: ' + e.message) })
    results.push('orders.impressa_por_user_id OK')

    await prisma.$queryRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_orders_impressa_por_company
      ON orders(impressa_por_company_id, etiqueta_impressa_em DESC)
      WHERE impressa_por_company_id IS NOT NULL
    `).catch(() => {})
    results.push('idx_orders_impressa_por_company OK')

    // data_contabil: corte 14h — se venda > 14h, vai pro próximo dia
    await prisma.$queryRawUnsafe(`
      ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS data_contabil DATE
    `).catch((e: any) => { throw new Error('data_contabil: ' + e.message) })
    results.push('orders.data_contabil OK')

    // Backfill data_contabil (created_at < 14h = mesmo dia, senão próximo)
    await prisma.$executeRawUnsafe(`
      UPDATE orders
      SET data_contabil = CASE
        WHEN EXTRACT(HOUR FROM created_at AT TIME ZONE 'America/Sao_Paulo') >= 14
        THEN ((created_at AT TIME ZONE 'America/Sao_Paulo')::date + INTERVAL '1 day')::date
        ELSE (created_at AT TIME ZONE 'America/Sao_Paulo')::date
      END
      WHERE data_contabil IS NULL
        AND created_at IS NOT NULL
    `).catch((e: any) => { throw new Error('backfill data_contabil: ' + e.message) })
    results.push('backfill data_contabil OK')

    await prisma.$queryRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_orders_data_contabil
      ON orders(company_id, data_contabil DESC)
      WHERE data_contabil IS NOT NULL
    `).catch(() => {})
    results.push('idx_orders_data_contabil OK')

    return NextResponse.json({ ok: true, results })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  return GET(req)
}
