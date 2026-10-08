/**
 * GET /api/admin/sync-today-company?company_id=X&hours=N
 *
 * Sincroniza vendas recentes (últimas N horas, default 1h) pra uma empresa.
 * Pode ser chamado em loop (a cada minuto via mavis cron).
 *
 * Uso: GET /api/admin/sync-today-company?company_id=3b1d4a0a...&hours=1
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
  const companyId = searchParams.get('company_id')
  const hours = Number(searchParams.get('hours') || 1)
  if (!companyId) {
    return NextResponse.json({ ok: false, error: 'company_id obrigatório' }, { status: 400 })
  }

  // Pega account ML da empresa
  const accRes: any = await prisma.$queryRawUnsafe(`
    SELECT id, account_id, nickname
    FROM marketplace_accounts
    WHERE company_id = $1::uuid AND plataforma = 'mercado_livre'
    LIMIT 1
  `, companyId)
  if (accRes.length === 0) {
    return NextResponse.json({ ok: false, error: 'Conta ML não encontrada' }, { status: 404 })
  }
  const acc = accRes[0]

  // Pega token
  const tokenRes = await getMLToken(companyId)
  if (!tokenRes?.token) {
    return NextResponse.json({ ok: false, error: 'Token ML indisponível' }, { status: 401 })
  }

  try {
    // Usa o sync.ts com days baseado nas horas (1h = 1 dia de janela por causa da granularidade)
    const days = Math.max(1, Math.ceil(hours / 24))
    const result = await syncOrdersFromML(String(acc.id), { days, all: false, limit: 100 })

    return NextResponse.json({
      ok: true,
      company_id: companyId,
      account_nickname: acc.nickname,
      days_window: days,
      hours_window: hours,
      fetched: result.total,
      criados: result.criados,
      erros: result.erros.length,
      last_run: new Date().toISOString(),
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}