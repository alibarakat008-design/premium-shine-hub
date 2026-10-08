/**
 * POST /api/admin/sync-forcado
 *
 * Força sync de uma empresa específica (debug/admin).
 * Body: { company_id: string, days?: number, limit?: number }
 *
 * Bypassa o middleware via Basic Auth.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { syncOrdersFromML } from '@/lib/mercadolivre/sync'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const companyId = body.company_id
    const days = body.days ?? 30
    const limit = body.limit ?? 50

    if (!companyId) {
      return NextResponse.json({ ok: false, error: 'company_id obrigatório' }, { status: 400 })
    }

    // Acha a marketplace_accounts dessa empresa
    const account = await prisma.marketplace_accounts.findFirst({
      where: { company_id: companyId, plataforma: 'mercado_livre', ativa: true },
    })
    if (!account) {
      return NextResponse.json({
        ok: false,
        error: 'Nenhuma marketplace_accounts vinculada a essa empresa. Rode POST /api/admin/vincular-ml-parceiro',
      }, { status: 400 })
    }

    console.log(`[sync-forcado] company=${companyId} account=${account.id} account_id=${account.account_id} days=${days} limit=${limit}`)

    const t0 = Date.now()
    const result = await syncOrdersFromML(account.id, { days, limit })
    return NextResponse.json({
      ok: true,
      company_id: companyId,
      account_id: account.id,
      ml_account_id: account.account_id,
      ml_nickname: account.nickname,
      days,
      limit,
      total: result.total,
      criados: result.criados,
      erros: result.erros,
      duracao_ms: Date.now() - t0,
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message, stack: e.stack?.slice(0, 500) }, { status: 500 })
  }
}