/**
 * Helper pra autenticação com Mercado Livre — multi-company
 *
 * - getMLToken(companyId?) — retorna token válido (com auto-refresh)
 *   Se companyId informado, usa companies.access_token_ml
 *   Senão, usa o token da matriz (LIURAESSENCE) via marketplace_accounts
 * - exchangeMLCode(code) — troca authorization_code por access_token
 * - getMLAuthUrl(companyId, redirectUri) — gera URL OAuth pro user autorizar
 */

import { prisma } from '@/lib/prisma'

interface TokenResult {
  token: string
  expires_at: Date
  source: 'company' | 'matriz'
  company_id?: string
  ml_user_id?: number
}

function getAppCreds() {
  const appId = process.env.ML_CLIENT_ID
  const secretKey = process.env.ML_CLIENT_SECRET
  if (!appId || !secretKey) {
    throw new Error('ML_CLIENT_ID ou ML_CLIENT_SECRET não configurados no .env')
  }
  return { appId, secretKey }
}

/**
 * Retorna token ML válido pra uma empresa específica (com auto-refresh)
 * Se não passar companyId, usa o token da matriz
 */
export async function getMLToken(companyId?: string): Promise<TokenResult | null> {
  if (companyId) {
    return getCompanyToken(companyId)
  }
  return getMatrizToken()
}

async function getMatrizToken(): Promise<TokenResult | null> {
  const account = await prisma.marketplace_accounts.findFirst({
    where: { plataforma: 'mercado_livre', nickname: 'LIURAESSENCE' },
  })
  if (!account || !account.access_token) return null

  // Se token válido por mais de 5min, usa direto
  if (account.token_expira_em && new Date(account.token_expira_em).getTime() > Date.now() + 5 * 60 * 1000) {
    return {
      token: account.access_token,
      expires_at: account.token_expira_em,
      source: 'matriz',
    }
  }

  // Token expirado, tenta refresh
  if (!account.refresh_token) return null

  try {
    const { appId, secretKey } = getAppCreds()
    const res = await fetch('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: appId,
        client_secret: secretKey,
        refresh_token: account.refresh_token,
      }),
    })

    if (!res.ok) return null

    const data = await res.json()
    const newExpiresAt = new Date(Date.now() + (data.expires_in || 21600) * 1000)
    await prisma.marketplace_accounts.update({
      where: { id: account.id },
      data: {
        access_token: data.access_token,
        refresh_token: data.refresh_token || account.refresh_token,
        token_expira_em: newExpiresAt,
        updated_at: new Date(),
      },
    })

    return {
      token: data.access_token,
      expires_at: newExpiresAt,
      source: 'matriz',
    }
  } catch {
    return null
  }
}

async function getCompanyToken(companyId: string): Promise<TokenResult | null> {
  const result: any[] = await prisma.$queryRawUnsafe(
    `SELECT id, access_token_ml, refresh_token_ml, ml_expires_at, ml_user_id
     FROM companies WHERE id = $1::uuid`,
    companyId,
  )
  if (result.length === 0) return null
  const c = result[0]
  if (!c.access_token_ml) return null

  // Se token válido por mais de 5min, usa direto
  if (c.ml_expires_at && new Date(c.ml_expires_at).getTime() > Date.now() + 5 * 60 * 1000) {
    return {
      token: c.access_token_ml,
      expires_at: c.ml_expires_at,
      source: 'company',
      company_id: c.id,
      ml_user_id: c.ml_user_id ? Number(c.ml_user_id) : undefined,
    }
  }

  // Token expirado, tenta refresh
  if (!c.refresh_token_ml) return null

  try {
    const { appId, secretKey } = getAppCreds()
    const res = await fetch('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: appId,
        client_secret: secretKey,
        refresh_token: c.refresh_token_ml,
      }),
    })

    if (!res.ok) return null

    const data = await res.json()
    const newExpiresAt = new Date(Date.now() + (data.expires_in || 21600) * 1000)
    const mlUserId = data.user_id || c.ml_user_id

    await prisma.$queryRawUnsafe(`
      UPDATE companies SET
        access_token_ml = $2,
        refresh_token_ml = $3,
        ml_expires_at = $4,
        ml_user_id = $5,
        updated_at = NOW()
      WHERE id = $1::uuid
    `, companyId, data.access_token, data.refresh_token || c.refresh_token_ml, newExpiresAt, mlUserId)

    return {
      token: data.access_token,
      expires_at: newExpiresAt,
      source: 'company',
      company_id: c.id,
      ml_user_id: mlUserId ? Number(mlUserId) : undefined,
    }
  } catch {
    return null
  }
}

/**
 * Gera URL OAuth pra user autorizar a integração com a conta ML DELE
 * @param companyId — empresa que vai receber o token
 * @param redirectUri — URL de callback (ex: https://app.com/api/admin/ml-oauth/callback)
 */
export function getMLAuthUrl(companyId: string, redirectUri: string): string {
  const { appId } = getAppCreds()
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: appId,
    redirect_uri: redirectUri,
    state: companyId, // Passa o company_id no state pra recuperar no callback
    site_id: 'MLB', // Força o site do Brasil (sem tela de seleção de país)
  })
  // Usa auth.mercadolivre.com (sem .br) + site_id=MLB — funciona em qualquer país, vai direto pro ML Brasil
  return `https://auth.mercadolivre.com/authorization?${params.toString()}`
}

/**
 * Troca authorization_code por access_token + refresh_token
 */
export async function exchangeMLCode(code: string, redirectUri: string): Promise<{
  access_token: string
  refresh_token: string
  expires_in: number
  user_id: number
  scope?: string
} | null> {
  const { appId, secretKey } = getAppCreds()
  try {
    const res = await fetch('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: appId,
        client_secret: secretKey,
        code,
        redirect_uri: redirectUri,
      }),
    })

    if (!res.ok) {
      const txt = await res.text()
      console.error('[exchangeMLCode] ML error:', res.status, txt)
      return null
    }

    return await res.json()
  } catch (e: any) {
    console.error('[exchangeMLCode] error:', e.message)
    return null
  }
}

/**
 * Testa se o token ML funciona fazendo uma chamada simples (ex: /users/me)
 */
export async function testMLToken(token: string): Promise<{ ok: boolean; user_id?: number; nickname?: string; error?: string }> {
  try {
    const r = await fetch('https://api.mercadolibre.com/users/me', {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!r.ok) {
      return { ok: false, error: `HTTP ${r.status}` }
    }
    const data = await r.json()
    return { ok: true, user_id: data.id, nickname: data.nickname }
  } catch (e: any) {
    return { ok: false, error: e.message }
  }
}