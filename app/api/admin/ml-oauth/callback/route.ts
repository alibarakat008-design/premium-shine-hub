import { NextRequest, NextResponse } from 'next/server'
import { exchangeMLCode, testMLToken } from '@/lib/ml-auth-multi'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/ml-oauth/callback?code=XXX&state=<company_id>
 *
 * Callback do OAuth ML. Troca o code por tokens, salva em companies.access_token_ml,
 * testa o token com /users/me, e redireciona pro painel com mensagem de sucesso/erro.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state') // company_id
  const error = searchParams.get('error')

  const origin = new URL(req.url).origin

  // Erro retornado pelo ML (user negou permissão, etc)
  if (error) {
    const msg = encodeURIComponent(`Erro OAuth ML: ${error}`)
    return NextResponse.redirect(`${origin}/admin/empresas/${state}/configuracao?ml_error=${msg}`)
  }

  if (!code || !state) {
    return NextResponse.json({ ok: false, error: 'code ou state (company_id) faltando' }, { status: 400 })
  }

  try {
    // Valida company
    const company: any[] = await prisma.$queryRawUnsafe(
      `SELECT id, nome_fantasia FROM companies WHERE id = $1::uuid`,
      state,
    )
    if (company.length === 0) {
      return NextResponse.json({ ok: false, error: 'Empresa não encontrada' }, { status: 404 })
    }

    // Troca code por tokens
    const redirectUri = `${origin}/api/admin/ml-oauth/callback`
    const tokens = await exchangeMLCode(code, redirectUri)
    if (!tokens) {
      const msg = encodeURIComponent('Não foi possível trocar o código por tokens')
      return NextResponse.redirect(`${origin}/admin/empresas/${state}/configuracao?ml_error=${msg}`)
    }

    // Testa o token
    const test = await testMLToken(tokens.access_token)
    if (!test.ok) {
      const msg = encodeURIComponent(`Token inválido: ${test.error}`)
      return NextResponse.redirect(`${origin}/admin/empresas/${state}/configuracao?ml_error=${msg}`)
    }

    // Salva em companies
    const expiresAt = new Date(Date.now() + (tokens.expires_in || 21600) * 1000)
    await prisma.$queryRawUnsafe(`
      UPDATE companies SET
        access_token_ml = $2,
        refresh_token_ml = $3,
        ml_expires_at = $4,
        ml_user_id = $5,
        updated_at = NOW()
      WHERE id = $1::uuid
    `, state, tokens.access_token, tokens.refresh_token, expiresAt, tokens.user_id)

    // Cria/vincula também em marketplace_accounts (pra reusar syncOrdersFromML)
    // Cada empresa parceira tem sua própria conta ML com account_id = ml_user_id
    // Vincula via company_id pra garantir 1:1
    const existingAccount = await prisma.marketplace_accounts.findFirst({
      where: { company_id: state, plataforma: 'mercado_livre' },
    })
    if (existingAccount) {
      await prisma.marketplace_accounts.update({
        where: { id: existingAccount.id },
        data: {
          account_id: String(tokens.user_id),
          nickname: test.nickname || existingAccount.nickname,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          token_expira_em: expiresAt,
          ativa: true,
          updated_at: new Date(),
        },
      })
    } else {
      await prisma.marketplace_accounts.create({
        data: {
          plataforma: 'mercado_livre',
          company_id: state,
          account_id: String(tokens.user_id),
          nickname: test.nickname || `ML-${tokens.user_id}`,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          token_expira_em: expiresAt,
          ativa: true,
        },
      })
    }

    // Sucesso — redireciona com msg
    const msg = encodeURIComponent(
      `✅ Conectado com sucesso! Conta ML: ${test.nickname} (${test.user_id})`,
    )
    return NextResponse.redirect(`${origin}/admin/empresas/${state}/configuracao?ml_success=${msg}`)
  } catch (e: any) {
    const msg = encodeURIComponent(`Erro inesperado: ${e.message}`)
    return NextResponse.redirect(`${origin}/admin/empresas/${state}/configuracao?ml_error=${msg}`)
  } finally {
    await prisma.$disconnect()
  }
}