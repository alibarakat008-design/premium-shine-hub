import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * POST /api/admin/assign-null-to-alameda
 *
 * Move todas as orders com company_id = NULL pra ALAMEDA.
 * Resolve o problema de OAuth que pegou conta errada.
 *
 * Aceita body: { confirm: 'yes' }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    if (body.confirm !== 'yes') {
      return NextResponse.json({
        ok: false,
        error: 'Confirme passando { confirm: "yes" } — operação irreversível!',
      }, { status: 400 })
    }

    const ALAMEDA_ID = '3b1d4a0a-b864-4177-a9ce-e122d2956766'

    // 1) Conta quantas
    const count: any[] = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS total FROM orders WHERE company_id IS NULL`
    )
    const total = count[0]?.total || 0

    if (total === 0) {
      return NextResponse.json({ ok: true, message: 'Nenhuma venda com company_id NULL', moved: 0 })
    }

    // 2) Move todas pra ALAMEDA
    const result: any = await prisma.$executeRawUnsafe(
      `UPDATE orders SET company_id = $1::uuid, updated_at = NOW() WHERE company_id IS NULL`,
      ALAMEDA_ID
    )

    // 3) Verifica
    const after: any[] = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS total FROM orders WHERE company_id = $1::uuid`,
      ALAMEDA_ID
    )

    return NextResponse.json({
      ok: true,
      moved: total,
      total_after: after[0]?.total || 0,
      alameda_id: ALAMEDA_ID,
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}

export async function GET(_req: NextRequest) {
  try {
    // Debug: count orders by company_id
    const count: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        CASE WHEN company_id IS NULL THEN 'NULL' ELSE 'NOT_NULL' END AS tipo,
        COUNT(*)::int AS total
      FROM orders
      GROUP BY (CASE WHEN company_id IS NULL THEN 'NULL' ELSE 'NOT_NULL' END)
    `)
    const totalNull = count.find((c: any) => c.tipo === 'NULL')?.total || 0
    return NextResponse.json({
      ok: true,
      null_count: totalNull,
      breakdown: count,
      message: 'POST { confirm: "yes" } pra mover NULLs pra ALAMEDA',
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}