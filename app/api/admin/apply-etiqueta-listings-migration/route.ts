/**
 * Adiciona etiqueta_impressa e etiqueta_impressa_em em marketplace_listings
 * (a migration original apply-etiqueta-migration só criou em orders)
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
    'ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS etiqueta_impressa BOOLEAN DEFAULT FALSE',
    'ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS etiqueta_impressa_em TIMESTAMPTZ',
    'CREATE INDEX IF NOT EXISTS marketplace_listings_etiqueta_idx ON marketplace_listings (etiqueta_impressa, account_id)',
  ]

  const results: any[] = []
  for (const sql of statements) {
    try {
      await prisma.$executeRawUnsafe(sql)
      results.push({ sql, ok: true })
    } catch (err: any) {
      results.push({ sql, ok: false, error: err.message.slice(0, 200) })
    }
  }

  return NextResponse.json({ ok: true, statements: results })
}