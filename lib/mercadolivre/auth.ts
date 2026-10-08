/**
 * =====================================================
 * HELPER DE AUTENTICAÇÃO ML — Refresh Token
 * =====================================================
 * Renova access_token usando refresh_token
 * Salva novo token no banco
 * =====================================================
 */

// lib/mercadolivre/auth.ts

import { PrismaClient } from '@prisma/client'
import { fetchWithRetry } from '@/lib/fetch-retry'

const prisma = new PrismaClient()

const ML_TOKEN_URL = 'https://api.mercadolibre.com/oauth/token'
const ML_CLIENT_ID = process.env.ML_CLIENT_ID!
const ML_CLIENT_SECRET = process.env.ML_CLIENT_SECRET!

export async function refreshAccessToken(accountId: string): Promise<{
  access_token: string
  refresh_token: string
  expires_in: number
}> {
  const account = await prisma.marketplace_accounts.findUnique({
    where: { id: accountId },
  })

  if (!account || !account.refresh_token) {
    throw new Error('Conta sem refresh_token, necessário reconectar')
  }

  // Trocar refresh_token por novo access_token (com retry em EPROTO)
  const data: any = await fetchWithRetry(ML_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: ML_CLIENT_ID,
      client_secret: ML_CLIENT_SECRET,
      refresh_token: account.refresh_token,
    }),
  }, 3, 2000)

  if (data?.error) {
    throw new Error(`Falha ao renovar token: ${JSON.stringify(data)}`)
  }
  const expiresAt = new Date(Date.now() + data.expires_in * 1000)

  // Salvar novos tokens
  await prisma.marketplace_accounts.update({
    where: { id: accountId },
    data: {
      access_token: data.access_token,
      refresh_token: data.refresh_token, // ML rotaciona o refresh_token também
      token_expira_em: expiresAt,
      updated_at: new Date(),
    },
  })

  console.log(`[ML Auth] Token renovado para ${account.nickname}, expira em ${expiresAt.toLocaleString('pt-BR')}`)

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in: data.expires_in,
  }
}
