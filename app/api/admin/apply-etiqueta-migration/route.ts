/**
 * One-time migration: adiciona etiqueta_impressa e etiqueta_impressa_em em orders
 * GET /api/admin/apply-etiqueta-migration?secret=LUXO2026
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    if (searchParams.get('secret') !== 'LUXO2026') {
      return NextResponse.json({ ok: false, error: 'secret inválido' }, { status: 401 })
    }

    const statements: string[] = [
      'ALTER TABLE orders ADD COLUMN IF NOT EXISTS etiqueta_impressa BOOLEAN DEFAULT FALSE',
      'ALTER TABLE orders ADD COLUMN IF NOT EXISTS etiqueta_impressa_em TIMESTAMPTZ',
      'CREATE INDEX IF NOT EXISTS orders_etiqueta_impressa_idx ON orders (etiqueta_impressa, status, created_at DESC)',
    ]

    const results: any[] = []
    for (const sql of statements) {
      try {
        await prisma.$executeRawUnsafe(sql)
        results.push({ sql, ok: true })
      } catch (err: any) {
        results.push({ sql, ok: false, error: err.message })
      }
    }

    return NextResponse.json({ ok: true, results })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
