/**
 * =====================================================
 * INTEGRAÇÃO SHOPEE — OAuth + Sincronização
 * Premium Shine Hub
 * =====================================================
 *
 * Diferenças vs Mercado Livre:
 *   - Usa API v2 oficial
 *   - Partner ID + Partner Key (não OAuth tradicional)
 *   - Tokens têm 4h de validade (precisa refresh antes)
 *   - Host varia por região (BR = openplatform.shopee.com.br)
 *
 * Endpoints:
 *   GET  /api/shopee/auth           — Inicia OAuth
 *   GET  /api/shopee/callback       — Callback
 *   GET  /api/shopee/accounts       — Lista contas
 *   DELETE /api/shopee/accounts/:id — Desconecta
 *   POST /api/shopee/sync/products  — Sincroniza produtos
 *   POST /api/shopee/sync/orders    — Sincroniza pedidos
 *   POST /api/shopee/sync/stock     — Push estoque
 *   POST /api/shopee/webhook        — Webhook
 * =====================================================
 */

// =====================================================
// CONFIGURAÇÃO
// =====================================================
const SHOPEE_PARTNER_ID = process.env.SHOPEE_PARTNER_ID!
const SHOPEE_PARTNER_KEY = process.env.SHOPEE_PARTNER_KEY!
const SHOPEE_REDIRECT_URI = process.env.SHOPEE_REDIRECT_URI || 'http://localhost:3000/api/shopee/callback'

// Hosts por região (Brasil)
const SHOPEE_HOST = 'https://openplatform.shopee.com.br'
const SHOPEE_API_HOST = 'https://openplatform.shopee.com.br'

// =====================================================
// SIGNATURE — Toda chamada à API Shopee precisa de assinatura
// =====================================================
import crypto from 'crypto'

function generateShopeeSignature(
  path: string,
  timestamp: number,
  accessToken: string,
  shopId: string
): string {
  const baseString = `${SHOPEE_PARTNER_ID}${path}${timestamp}${accessToken}${shopId}`
  return crypto
    .createHmac('sha256', SHOPEE_PARTNER_KEY)
    .update(baseString)
    .digest('hex')
}

// =====================================================
// HELPER: Fazer requisição autenticada
// =====================================================

async function shopeeFetch(
  accountId: string,
  path: string,
  options: { method?: string; body?: any; query?: any } = {}
): Promise<any> {
  const account = await prisma.marketplace_accounts.findUnique({
    where: { id: accountId },
  })

  if (!account || !account.ativa) {
    throw new Error('Conta Shopee não encontrada ou inativa')
  }

  // Verificar se token está expirado (4h de validade)
  const expiraEm = account.token_expira_em ? new Date(account.token_expira_em).getTime() : 0
  const margem = 5 * 60 * 1000 // 5 min de margem

  if (Date.now() > expiraEm - margem) {
    // Renovar token
    const newToken = await refreshShopeeToken(accountId)
    account.access_token = newToken.access_token
    account.refresh_token = newToken.refresh_token
  }

  // Montar URL com query params
  const timestamp = Math.floor(Date.now() / 1000)
  const shopId = account.account_id

  const queryString = new URLSearchParams({
    partner_id: SHOPEE_PARTNER_ID,
    timestamp: String(timestamp),
    access_token: account.access_token || '',
    shop_id: shopId,
    ...(options.query || {}),
  }).toString()

  // Gerar assinatura
  const signature = generateShopeeSignature(path, timestamp, account.access_token || '', shopId)
  queryString.concat(`&sign=${signature}`)

  const url = `${SHOPEE_API_HOST}${path}?${queryString}`

  const res = await fetch(url, {
    method: options.method || 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: options.body ? JSON.stringify(options.body) : undefined,
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Shopee API error ${res.status}: ${err}`)
  }

  return res.json()
}

// =====================================================
// REFRESH TOKEN
// =====================================================
async function refreshShopeeToken(accountId: string): Promise<{
  access_token: string
  refresh_token: string
  expire_in: number
}> {
  const account = await prisma.marketplace_accounts.findUnique({
    where: { id: accountId },
  })

  if (!account || !account.refresh_token) {
    throw new Error('Conta sem refresh_token, necessário reconectar')
  }

  const path = '/api/v2/auth/access_token/get'
  const timestamp = Math.floor(Date.now() / 1000)
  const shopId = account.account_id

  const signature = generateShopeeSignature(path, timestamp, '', shopId)

  const url = `${SHOPEE_API_HOST}${path}?partner_id=${SHOPEE_PARTNER_ID}&timestamp=${timestamp}&shop_id=${shopId}&refresh_token=${account.refresh_token}&sign=${signature}`

  const res = await fetch(url, { method: 'POST' })
  if (!res.ok) throw new Error(`Falha ao renovar token Shopee`)

  const data: any = await res.json()

  if (data.error) {
    throw new Error(`Shopee refresh error: ${data.message}`)
  }

  const expiresAt = new Date(Date.now() + data.expire_in * 1000)

  await prisma.marketplace_accounts.update({
    where: { id: accountId },
    data: {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      token_expira_em: expiresAt,
      updated_at: new Date(),
    },
  })

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expire_in: data.expire_in,
  }
}

// =====================================================
// 1) INICIAR OAUTH
// =====================================================
// app/api/shopee/auth/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {

  const { searchParams } = new URL(request.url)
  const state = searchParams.get('state')

  if (!state) {
    return NextResponse.json({ error: 'state obrigatório' }, { status: 400 })
  }

  // URL de autorização da Shopee
  const authUrl = new URL(`${SHOPEE_HOST}/api/v2/shop/auth_partner`)
  authUrl.searchParams.set('partner_id', SHOPEE_PARTNER_ID)
  authUrl.searchParams.set('redirect', SHOPEE_REDIRECT_URI)
  authUrl.searchParams.set('state', state)
  // Token de longa duração (não expira em 1 ano)
  authUrl.searchParams.set('token_duration', 'persistent')

  return NextResponse.redirect(authUrl.toString())
}
