import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/add-manual-canal-enum
 *
 * Adiciona o valor 'manual' ao enum canal_venda.
 * Necessário pra cadastrar custos via Parceiros (que não são de nenhum canal de venda específico).
 *
 * Idempotente: ALTER TYPE ... ADD VALUE não dá erro se valor já existe (em PG 12+).
 */
export async function POST(_req: NextRequest) {
  try {
    await prisma.$executeRawUnsafe(`ALTER TYPE canal_venda ADD VALUE IF NOT EXISTS 'manual'`)
    return NextResponse.json({ ok: true, message: 'Valor "manual" adicionado ao enum canal_venda (ou já existia)' })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}

export async function GET(_req: NextRequest) {
  return POST(_req)
}