import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { exchangeMLCode, testMLToken } from '@/lib/ml-auth-multi'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * POST /api/public/oauth-by-code
 * Body: { code: string, state: string (company_id) }
 *
 * Endpoint pra aceitar o code OAuth diretamente.
 *
 * Útil quando o user não consegue acessar a página de auth ML
 * (rate limit Cloudflare, etc). O vendor loga no ML manualmente e
 * copia o code da URL de redirect.
 *
 * Fluxo:
 *  1) Vendor abre: https://auth.mercadolibre.com.br/authorization?...
 *  2) Loga no ML (conta do GH SHOP)
 *  3) Autoriza o app
 *  4) ML redireciona pro callback. URL fica tipo:
 *     https://premium-shine-hub.vercel.app/api/admin/ml-oauth/callback?code=XXX&state=YYY
 *  5) Se der erro 401 (Basic Auth), vendor copia a URL INTEIRA
 *  6) POST aqui com { code, state } → salva o token
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { code, state } = body
    if (!code || !state) {
      return NextResponse.json({ ok: false, error: 'code e state obrigatórios' }, { status: 400 })
    }

    // Valida company
    const company: any[] = await prisma.$queryRawUnsafe(
      `SELECT id, nome_fantasia FROM companies WHERE id = $1::uuid`,
      state,
    )
    if (company.length === 0) {
      return NextResponse.json({ ok: false, error: 'Empresa não encontrada' }, { status: 404 })
    }

    // Troca code por tokens
    const origin = new URL(req.url).origin
    const redirectUri = `${origin}/api/admin/ml-oauth/callback`
    const tokens = await exchangeMLCode(code, redirectUri)
    if (!tokens) {
      return NextResponse.json({ ok: false, error: 'Não foi possível trocar o code por tokens' }, { status: 500 })
    }

    // Testa o token
    const test = await testMLToken(tokens.access_token)
    if (!test.ok) {
      return NextResponse.json({ ok: false, error: `Token inválido: ${test.error}` }, { status: 500 })
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

    // Cria/vincula também em marketplace_accounts
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

    return NextResponse.json({
      ok: true,
      message: `✅ Conectado! Conta ML: ${test.nickname} (${test.user_id})`,
      company: company[0],
      ml_account: {
        user_id: tokens.user_id,
        nickname: test.nickname,
        expires_at: expiresAt,
      },
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}

// GET: documenta como usar
export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: '/api/public/oauth-by-code',
    method: 'POST',
    body: { code: 'TG-XXX...', state: 'a2176d33-f604-48cf-8d8a-df4313ce1417' },
    steps: [
      '1) Vendor abre: https://auth.mercadolibre.com.br/authorization?response_type=code&client_id=2351649987737188&redirect_uri=https%3A%2F%2Fpremium-shine-hub.vercel.app%2Fapi%2Fadmin%2Fml-oauth%2Fcallback&state=a2176d33-f604-48cf-8d8a-df4313ce1417',
      '2) Faz login no ML (conta do GH SHOP)',
      '3) Autoriza o app',
      '4) ML redireciona pro callback. URL vai ter ?code=XXX&state=YYY',
      '5) Se der erro 401 (Basic Auth), copia a URL INTEIRA',
      '6) POST aqui com { code, state } (do query string)',
    ],
  })
}