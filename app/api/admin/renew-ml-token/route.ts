/**
 * =====================================================
 * API: Renovar Token ML
 * POST /api/admin/renew-ml-token
 * Body: { account_id: string }
 * =====================================================
 * Renova o access_token de uma conta ML via refresh_token.
 *
 * Reescrito em 2026-09-01: a versão antiga chamava a Management API do Supabase
 * com um Personal Access Token REAL gravado direto no código (mesmo token exposto
 * em outros 4 arquivos do projeto — vale revogar no painel do Supabase e gerar um
 * novo, já que uma vez exposto no código-fonte ele não deve ser considerado seguro
 * mesmo depois de removido daqui) e montava o SQL colando os valores direto na
 * string (injeção de SQL — se o access_token/refresh_token do ML viesse com aspas
 * simples, por exemplo, o UPDATE quebrava silenciosamente e o token não era salvo,
 * o que pode explicar falhas de renovação). Agora usa o Prisma normal (mesma conexão
 * que o resto do app já usa) com valores sempre parametrizados.
 */
import { NextRequest, NextResponse } from 'next/server'
import { isMatrizRequest } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const ML_TOKEN_URL = 'https://api.mercadolibre.com/oauth/token'
const ML_CLIENT_ID = process.env.ML_CLIENT_ID!
const ML_CLIENT_SECRET = process.env.ML_CLIENT_SECRET!

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest) {
  if (!isMatrizRequest(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json().catch(() => null)
    const accountId = body?.account_id
    if (!accountId || !UUID_RE.test(accountId)) {
      return NextResponse.json({ ok: false, error: 'account_id inválido' }, { status: 400 })
    }

    const account = await prisma.marketplace_accounts.findUnique({
      where: { id: accountId },
      select: { id: true, nickname: true, refresh_token: true },
    })

    if (!account) {
      return NextResponse.json({ ok: false, error: 'Conta não encontrada' }, { status: 404 })
    }
    if (!account.refresh_token) {
      return NextResponse.json({ ok: false, error: 'Conta sem refresh_token. Reconecte via OAuth.' }, { status: 400 })
    }
    if (!ML_CLIENT_ID || !ML_CLIENT_SECRET) {
      return NextResponse.json({ ok: false, error: 'ML_CLIENT_ID/ML_CLIENT_SECRET não configurados no servidor' }, { status: 503 })
    }

    // Tenta refresh do token
    const refreshBody = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: ML_CLIENT_ID,
      client_secret: ML_CLIENT_SECRET,
      refresh_token: account.refresh_token,
    })

    const refreshRes = await fetch(ML_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: refreshBody,
    })

    if (!refreshRes.ok) {
      const err = await refreshRes.text()
      return NextResponse.json({ ok: false, error: `ML rejeitou refresh: ${err.slice(0, 300)}` }, { status: 502 })
    }

    const tokens: any = await refreshRes.json()
    if (!tokens.access_token || !tokens.refresh_token) {
      return NextResponse.json({ ok: false, error: 'ML não retornou access_token/refresh_token válidos' }, { status: 502 })
    }
    const expiresAt = new Date(Date.now() + (tokens.expires_in || 21600) * 1000)

    await prisma.marketplace_accounts.update({
      where: { id: accountId },
      data: {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_expira_em: expiresAt,
        updated_at: new Date(),
      },
    })

    return NextResponse.json({
      ok: true,
      message: 'Token renovado!',
      expires_in: tokens.expires_in,
      expires_at: expiresAt.toISOString(),
    })
  } catch (err: any) {
    console.error('[renew-ml-token]', err)
    return NextResponse.json({ ok: false, error: err.message?.substring(0, 500) }, { status: 500 })
  }
}
