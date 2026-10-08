import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * Aplica migration ad-hoc: adiciona coluna recebimento_liquido
 * GET /api/admin/apply-recebimento-migration?secret=LUXO2026
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    if (searchParams.get('secret') !== 'LUXO2026') {
      return NextResponse.json({ ok: false, error: 'secret inválido' }, { status: 401 })
    }

    await prisma.$executeRawUnsafe(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS recebimento_liquido NUMERIC(10,2);`)
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_orders_recebimento ON orders(recebimento_liquido);`)

    // Confirma
    const cols = await prisma.$queryRawUnsafe<any[]>(`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_name = 'orders' AND column_name = 'recebimento_liquido'
    `)

    return NextResponse.json({
      ok: true,
      mensagem: 'Coluna recebimento_liquido adicionada com sucesso',
      coluna: cols[0],
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
