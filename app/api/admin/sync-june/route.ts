import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { syncOrdersFromML } from '@/lib/mercadolivre/sync'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * GET /api/admin/sync-june?days=45
 *
 * Roda syncOrdersFromML com days=45 (cobre junho inteiro).
 * A função já é idempotente — só cria vendas que não existem.
 *
 * Returns: { total, criados, erros, sample }
 */
export async function GET(req: NextRequest) {
  try {
    const acc = await prisma.marketplace_accounts.findFirst({
      where: { nickname: 'LIURAESSENCE' },
    })
    if (!acc) return NextResponse.json({ ok: false, error: 'Conta não encontrada' }, { status: 404 })

    const { searchParams } = new URL(req.url)
    const days = Math.max(7, Math.min(Number(searchParams.get('days') || 45), 90))
    const limit = Math.max(100, Math.min(Number(searchParams.get('limit') || 2000), 5000))

    const result = await syncOrdersFromML(acc.id, { days, limit })

    return NextResponse.json({
      ok: true,
      mes: 'junho (via days=' + days + ')',
      account_id: acc.id,
      total_encontradas_ml: result.total,
      criados: result.criados,
      erros: result.erros.length,
      error_samples: result.erros.slice(0, 10),
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message, stack: e.stack }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}