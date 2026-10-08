/**
 * Migration: adiciona coluna pack_id em orders
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
    await prisma.$executeRawUnsafe(
      'ALTER TABLE orders ADD COLUMN IF NOT EXISTS pack_id VARCHAR(50)'
    )
    await prisma.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS orders_pack_id_idx ON orders (pack_id)'
    )
    return NextResponse.json({ ok: true, mensagem: 'Coluna pack_id criada' })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}