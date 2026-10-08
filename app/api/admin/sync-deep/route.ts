/**
 * GET /api/admin/sync-deep?account_id=X&hours=N
 *
 * Sync pesado pra QUALQUER conta — processa TODAS as vendas nas últimas N horas
 * com paginação completa. Pode estourar timeout Vercel (60s Hobby) — usar com cuidado.
 *
 * Pra auto-sync: usar /api/admin/sync-orders-by-account (1h window, mais leve)
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getMLToken } from '@/lib/ml-auth-multi'
import { syncOrdersFromML } from '@/lib/mercadolivre/sync'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const accountId = searchParams.get('account_id')
  const hours = Number(searchParams.get('hours') || 24)
  const days = Math.max(1, Math.ceil(hours / 24))

  if (!accountId) {
    return NextResponse.json({ ok: false, error: 'account_id obrigatório' }, { status: 400 })
  }

  const acc: any = await prisma.marketplace_accounts.findUnique({ where: { id: accountId } })
  if (!acc) return NextResponse.json({ ok: false, error: 'Conta ML não encontrada' }, { status: 404 })

  const tokenRes = await getMLToken(acc.company_id)
  if (!tokenRes?.token) return NextResponse.json({ ok: false, error: 'Token ML indisponível' }, { status: 401 })

  try {
    // Sync com days=N (pega TUDO)
    const result = await syncOrdersFromML(accountId, { days, all: false, limit: 50 })

    return NextResponse.json({
      ok: true,
      account_id: accountId,
      account_nickname: acc.nickname,
      company_id: acc.company_id,
      days,
      hours,
      fetched: result.total,
      created: result.criados,
      erros: result.erros.length,
      error_samples: result.erros.slice(0, 3),
      last_run: new Date().toISOString(),
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}