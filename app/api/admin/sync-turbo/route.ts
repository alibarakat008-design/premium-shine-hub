/**
 * Sync turbo: pega os 25 orders mais recentes.
 *
 * Multi-tenant: detecta a empresa do cookie (parceiro) OU usa LIURAESSENCE (matriz legacy).
 *
 * GET /api/admin/sync-turbo?secret=LUXO2026
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { syncOrdersFromML } from '@/lib/mercadolivre/sync'
import { verifySessionToken, getCookieName } from '@/lib/auth-parceiro'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function getCompanyIdFromCookie(req: NextRequest): string | null {
  const token = req.cookies.get(getCookieName())?.value
  if (token) {
    const session = verifySessionToken(token)
    if (session) return session.companyId
  }
  const active = req.cookies.get('psh_session_company')?.value
  return active || null
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || ''
  const { searchParams } = new URL(req.url)
  const secret = searchParams.get('secret')
  if (secret !== 'LUXO2026' && !authHeader.startsWith('Basic ')) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const t0 = Date.now()
  const companyIdFromCookie = getCompanyIdFromCookie(req)

  try {
    let account: { id: string; nickname: string | null; company_id: string | null } | null = null

    // 1) Se tem company_id no cookie → busca marketplace_accounts dessa empresa
    if (companyIdFromCookie) {
      account = await prisma.marketplace_accounts.findFirst({
        where: { company_id: companyIdFromCookie, plataforma: 'mercado_livre', ativa: true },
        select: { id: true, nickname: true, company_id: true },
      })
      if (!account) {
        return NextResponse.json({
          ok: false,
          error: `Esta empresa não tem conta ML vinculada. Conecte o Mercado Livre em /admin/empresas/${companyIdFromCookie}/configuracao primeiro, ou rode POST /api/admin/vincular-ml-parceiro.`,
          company_id: companyIdFromCookie,
        }, { status: 400 })
      }
    } else {
      // 2) Fallback matriz: LIURAESSENCE
      account = await prisma.marketplace_accounts.findFirst({
        where: { plataforma: 'mercado_livre', nickname: 'LIURAESSENCE' },
        select: { id: true, nickname: true, company_id: true },
      })
      if (!account) {
        return NextResponse.json({ ok: false, error: 'Conta LIURAESSENCE não encontrada' }, { status: 404 })
      }
    }

    // Aceita days e limit via query (default razoável pra parceiro: 30 dias, 25 vendas)
    const days = Math.min(Number(searchParams.get('days') || 30), 90)
    const limit = Math.min(Number(searchParams.get('limit') || 25), 100)

    const result = await syncOrdersFromML(account.id, { days, limit })
    return NextResponse.json({
      ok: true,
      account: account.nickname,
      company_id: account.company_id,
      days,
      limit,
      total: result.total,
      criados: result.criados,
      erros: result.erros.length,
      erro_detalhes: result.erros.slice(0, 5),
      duracao_ms: Date.now() - t0,
    })
  } catch (err: any) {
    return NextResponse.json({
      ok: false,
      error: err.message?.slice(0, 300),
      duracao_ms: Date.now() - t0,
    })
  }
}