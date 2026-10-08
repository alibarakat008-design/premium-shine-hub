/**
 * POST /api/admin/add-fulfillment-columns
 *
 * Adiciona colunas de controle de expedição em orders:
 *   - etiqueta_impressa_em TIMESTAMP NULL
 *   - embalado_em TIMESTAMP NULL
 *
 * Idempotente — usa IF NOT EXISTS.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function POST(_req: NextRequest) {
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS etiqueta_impressa_em TIMESTAMP NULL
    `)
    await prisma.$executeRawUnsafe(`
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS embalado_em TIMESTAMP NULL
    `)
    return NextResponse.json({
      ok: true,
      message: 'Colunas etiqueta_impressa_em e embalado_em adicionadas (ou já existiam)',
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}