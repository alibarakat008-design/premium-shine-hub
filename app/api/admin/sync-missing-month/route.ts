import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { syncOrdersFromML } from '@/lib/mercadolivre/sync'

export const dynamic = 'force-dynamic'
export const maxDuration = 120 // 2 min Vercel

/**
 * GET /api/admin/sync-missing-month?days=45&limit=2000
 *
 * Re-sincroniza vendas faltantes de N dias atrás até agora.
 * syncOrdersFromML é IDEMPOTENTE: checa DB por (marketplace_account_id + payment_id)
 * antes de criar. Rodar N vezes = mesmo resultado.
 *
 * Estratégia: passar `days` grande o suficiente pra cobrir o mês desejado.
 * Ex: days=45 cobre ~45 dias atrás até hoje (de 2026-07-08, cobre todo jun/2026).
 *
 * Returns: { total_encontradas_ml, criados, erros, error_samples }
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const days = Math.max(1, Math.min(Number(searchParams.get('days') || 45), 90))
  const limit = Math.max(100, Math.min(Number(searchParams.get('limit') || 2000), 10000))

  try {
    const acc = await prisma.marketplace_accounts.findFirst({
      where: { nickname: 'LIURAESSENCE' },
    })
    if (!acc) return NextResponse.json({ ok: false, error: 'Conta ML não encontrada' }, { status: 404 })

    console.log(`[sync-missing-month] account=${acc.id} days=${days} limit=${limit}`)

    // syncOrdersFromML busca no ML os últimos N dias, checa DB, e cria só os que faltam
    const result = await syncOrdersFromML(acc.id, { days, limit })

    return NextResponse.json({
      ok: true,
      days,
      limit,
      account_id: acc.id,
      found_in_ml: result.total,
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