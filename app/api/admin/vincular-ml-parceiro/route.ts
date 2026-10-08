import { NextRequest, NextResponse } from 'next/server'
import { verifySessionToken, getCookieName } from '@/lib/auth-parceiro'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/vincular-ml-parceiro
 *
 * Cria/vincula uma row em marketplace_accounts pra empresa parceira
 * que JÁ conectou o ML (company.access_token_ml existe) mas NÃO tem
 * marketplace_accounts correspondente. Necessário após a refatoração
 * que fez o sync-turbo buscar a conta por company_id.
 *
 * POST sem body — lê company_id do cookie + token_ml do companies
 */

function getCompanyIdFromCookie(req: NextRequest): string | null {
  const token = req.cookies.get(getCookieName())?.value
  if (token) {
    const session = verifySessionToken(token)
    if (session) return session.companyId
  }
  const active = req.cookies.get('psh_session_company')?.value
  return active || null
}

export async function POST(req: NextRequest) {
  // Aceita company_id no body OU cookie (admin pode chamar pra qualquer empresa)
  let companyId: string | null = null
  try {
    const body = await req.json()
    if (body?.company_id) companyId = body.company_id
  } catch { /* sem body */ }
  if (!companyId) companyId = getCompanyIdFromCookie(req)

  // Se tem Basic Auth (admin) e nenhum company_id no body/cookie → erro pedindo company_id
  if (!companyId) {
    return NextResponse.json({
      ok: false,
      error: 'company_id obrigatório (envie no body ou faça login como parceiro)',
    }, { status: 400 })
  }

  try {
    // Pega dados ML da empresa (CAST ml_user_id pra text pra evitar BigInt no JSON)
    const company: any[] = await prisma.$queryRawUnsafe(
      `SELECT id::text AS id, nome_fantasia, access_token_ml, refresh_token_ml, ml_expires_at,
              ml_user_id::text AS ml_user_id
       FROM companies WHERE id = $1::uuid`,
      companyId,
    )
    if (company.length === 0) {
      return NextResponse.json({ ok: false, error: 'Empresa não encontrada' }, { status: 404 })
    }
    const c = company[0]
    if (!c.access_token_ml) {
      return NextResponse.json({
        ok: false,
        error: 'Esta empresa ainda não tem token ML. Conecte o Mercado Livre primeiro.',
      }, { status: 400 })
    }

    // Converte BigInt → string pra JSON serialize
    const mlUserIdStr = c.ml_user_id != null ? String(c.ml_user_id) : null

    // Verifica se já tem marketplace_accounts vinculado
    const existing = await prisma.marketplace_accounts.findFirst({
      where: { company_id: companyId, plataforma: 'mercado_livre' },
    })
    if (existing) {
      // Atualiza tokens
      await prisma.marketplace_accounts.update({
        where: { id: existing.id },
        data: {
          access_token: c.access_token_ml,
          refresh_token: c.refresh_token_ml,
          token_expira_em: c.ml_expires_at,
          account_id: c.ml_user_id ? String(c.ml_user_id) : existing.account_id,
          ativa: true,
          updated_at: new Date(),
        },
      })
      return NextResponse.json({
        ok: true,
        message: `Conta ML já existia — tokens atualizados`,
        account_id: existing.id,
        ml_user_id: mlUserIdStr,
      })
    }

    // Cria nova marketplace_accounts
    const newAccount = await prisma.marketplace_accounts.create({
      data: {
        plataforma: 'mercado_livre',
        company_id: companyId,
        account_id: mlUserIdStr,
        nickname: c.nome_fantasia,
        access_token: c.access_token_ml,
        refresh_token: c.refresh_token_ml,
        token_expira_em: c.ml_expires_at,
        ativa: true,
      },
    })

    return NextResponse.json({
      ok: true,
      message: `Conta ML vinculada com sucesso`,
      account_id: newAccount.id,
      ml_user_id: mlUserIdStr,
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}