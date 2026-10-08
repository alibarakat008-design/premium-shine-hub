/**
 * Helper pra autenticação com Mercado Livre
 * - Usa o token salvo em marketplace_accounts.access_token
 * - Refresh automático se expirado (com retry em EPROTO)
 */

import { prisma } from '@/lib/prisma'
import { fetchWithRetry } from './fetch-retry'

interface TokenResult {
  token: string
  expires_at: Date
  account_id: string
}

export async function getMLToken(): Promise<TokenResult | null> {
  const account = await prisma.marketplace_accounts.findFirst({
    where: { plataforma: 'mercado_livre', nickname: 'LIURAESSENCE' },
  })
  if (!account || !account.access_token) return null

  // Se token válido por mais de 5min, usa direto
  if (account.token_expira_em && new Date(account.token_expira_em).getTime() > Date.now() + 5 * 60 * 1000) {
    return {
      token: account.access_token,
      expires_at: account.token_expira_em,
      account_id: account.id,
    }
  }

  // Token expirado, tenta refresh
  if (!account.refresh_token) return null

  const appId = process.env.ML_CLIENT_ID
  const secretKey = process.env.ML_CLIENT_SECRET
  if (!appId || !secretKey) return null

  try {
    const data = await fetchWithRetry<any>('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: appId,
        client_secret: secretKey,
        refresh_token: account.refresh_token,
      }),
    }, 3, 1500)

    if (!data?.access_token) return null

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
      account_id: account.id,
    }
  } catch (err: any) {
    console.error('[ML Auth] Falha ao renovar token:', err?.message || err)
    return null
  }
}
