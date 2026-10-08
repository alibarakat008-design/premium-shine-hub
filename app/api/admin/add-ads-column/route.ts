import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/add-ads-column
 * Adiciona coluna ads_valor na tabela orders (idempotente)
 */
export async function POST(_req: NextRequest) {
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS ads_valor DECIMAL(10, 2) DEFAULT 0
    `)
    return NextResponse.json({ ok: true, message: 'Coluna ads_valor adicionada' })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}

export async function GET(_req: NextRequest) {
  return POST(_req)
}