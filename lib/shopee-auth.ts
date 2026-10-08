/**
 * Helper de autenticação Shopee Open Platform — multi-company
 *
 * - getShopeeToken(companyId) — retorna token válido (com auto-refresh)
 * - exchangeShopeeCode(code, shopId) — troca authorization_code por tokens
 * - getShopeeAuthUrl(companyId, redirectUri) — gera URL OAuth pro user autorizar
 * - signShopee(partnerKey, partnerId, path, timestamp, accessToken, shopId, body) — HMAC-SHA256 sign
 * - callShopeeAPI(...) — wrapper pra chamadas autenticadas
 *
 * Credenciais em .env:
 * - SHOPEE_PARTNER_ID
 * - SHOPEE_PARTNER_KEY
 * - SHOPEE_ENV (sandbox | live) — default: live
 *
 * URLs (varia por env):
 *   - live:     https://partner.shopeemobile.com
 *   - sandbox:  https://partner.test-stable.shopeemobile.com
 *
 * Docs: https://open.shopee.com/developer-guide/12
 */

import { prisma } from '@/lib/prisma'
import crypto from 'crypto'

function getEnv() {
  return process.env.SHOPEE_ENV === 'sandbox' ? 'sandbox' : 'live'
}

function getHost() {
  return getEnv() === 'sandbox'
    ? 'https://partner.test-stable.shopeemobile.com'
    : 'https://partner.shopeemobile.com'
}

function getAppCreds() {
  const partnerId = process.env.SHOPEE_PARTNER_ID
  const partnerKey = process.env.SHOPEE_PARTNER_KEY
  if (!partnerId || !partnerKey) {
    throw new Error('SHOPEE_PARTNER_ID ou SHOPEE_PARTNER_KEY não configurados no .env')
  }
  return { partnerId, partnerKey }
}

/**
 * Gera a assinatura HMAC-SHA256 que a Shopee exige.
 * Estrutura: partner_id + api_path + timestamp + access_token + shop_id + body
 */
export function signShopee(
  partnerKey: string,
  partnerId: string,
  path: string,
  timestamp: number,
  accessToken = '',
  shopId: number | string = '',
  body = '',
): string {
  const baseString = `${partnerId}${path}${timestamp}${accessToken}${shopId}${body}`
  return crypto.createHmac('sha256', partnerKey).update(baseString).digest('hex')
}

/**
 * Retorna token Shopee válido pra uma empresa (com auto-refresh)
 */
export async function getShopeeToken(companyId: string): Promise<{
  access_token: string
  refresh_token: string
  shop_id: number
  expires_at: Date
} | null> {
  const company: any = await prisma.$queryRawUnsafe(
    `SELECT shopee_access_token, shopee_refresh_token, shopee_shop_id, shopee_expires_at
     FROM companies WHERE id = $1::uuid`,
    companyId,
  )
  if (!company[0] || !company[0].shopee_access_token) return null

  const { shopee_access_token, shopee_refresh_token, shopee_shop_id, shopee_expires_at } = company[0]

  if (new Date(shopee_expires_at).getTime() > Date.now() + 5 * 60 * 1000) {
    return {
      access_token: shopee_access_token,
      refresh_token: shopee_refresh_token,
      shop_id: Number(shopee_shop_id),
      expires_at: new Date(shopee_expires_at),
    }
  }

  try {
    const { partnerId, partnerKey } = getAppCreds()
    const path = '/api/v2/auth/access_token/get'
    const timestamp = Math.floor(Date.now() / 1000)
    const body = JSON.stringify({
      shop_id: Number(shopee_shop_id),
      refresh_token: shopee_refresh_token,
    })
    const sign = signShopee(partnerKey, partnerId, path, timestamp, '', shopee_shop_id, body)

    const res = await fetch(`${getHost()}${path}?partner_id=${partnerId}&timestamp=${timestamp}&sign=${sign}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    })

    if (!res.ok) {
      console.error('[shopee] refresh error', res.status, await res.text())
      return null
    }
    const data = await res.json()
    if (!data.access_token) {
      console.error('[shopee] refresh no access_token', data)
      return null
    }

    const newExpiresAt = new Date(Date.now() + (data.expire_in || 14400) * 1000)
    await prisma.$queryRawUnsafe(
      `UPDATE companies SET shopee_access_token = $2, shopee_refresh_token = $3, shopee_expires_at = $4, updated_at = NOW() WHERE id = $1::uuid`,
      companyId,
      data.access_token,
      data.refresh_token || shopee_refresh_token,
      newExpiresAt,
    )

    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token || shopee_refresh_token,
      shop_id: Number(shopee_shop_id),
      expires_at: newExpiresAt,
    }
  } catch (e: any) {
    console.error('[shopee] refresh exception', e?.message)
    return null
  }
}

/**
 * Troca o authorization_code pelo access_token + refresh_token
 */
export async function exchangeShopeeCode(
  code: string,
  shopId: number | string,
): Promise<{
  access_token: string
  refresh_token: string
  expire_in: number
  shop_id: number
} | null> {
  const { partnerId, partnerKey } = getAppCreds()
  const path = '/api/v2/auth/token/get'
  const timestamp = Math.floor(Date.now() / 1000)
  const body = JSON.stringify({ code, shop_id: Number(shopId) })
  const sign = signShopee(partnerKey, partnerId, path, timestamp, '', shopId, body)

  const res = await fetch(`${getHost()}${path}?partner_id=${partnerId}&timestamp=${timestamp}&sign=${sign}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  })

  if (!res.ok) {
    console.error('[shopee] exchange error', res.status, await res.text())
    return null
  }
  const data = await res.json()
  if (!data.access_token) {
    console.error('[shopee] exchange no access_token', data)
    return null
  }
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expire_in: data.expire_in || 14400,
    shop_id: data.shop_id || Number(shopId),
  }
}

/**
 * Gera URL pra autorização do user.
 * IMPORTANTE: link válido por apenas 5 minutos (timestamp atual)
 */
export function getShopeeAuthUrl(companyId: string, redirectUri: string): string {
  const { partnerId, partnerKey } = getAppCreds()
  const path = '/api/v2/shop/auth_partner'
  const timestamp = Math.floor(Date.now() / 1000)
  const sign = signShopee(partnerKey, partnerId, path, timestamp)

  const params = new URLSearchParams({
    partner_id: partnerId,
    timestamp: String(timestamp),
    sign,
    redirect: redirectUri,
    state: companyId,
  })
  return `${getHost()}${path}?${params.toString()}`
}

/**
 * Chama uma API autenticada da Shopee.
 * path = '/api/v2/...' (inclui /api/v2)
 * method = 'GET' | 'POST'
 * body = objeto (vai ser JSON.stringify) — pra GET passa {}
 */
export async function callShopeeAPI<T = any>(
  companyId: string,
  path: string,
  method: 'GET' | 'POST' = 'GET',
  body: Record<string, any> = {},
): Promise<{ ok: boolean; data?: T; error?: string; http_status?: number }> {
  const token = await getShopeeToken(companyId)
  if (!token) return { ok: false, error: 'Token Shopee indisponível (precisa reconectar)' }

  const { partnerId, partnerKey } = getAppCreds()
  const timestamp = Math.floor(Date.now() / 1000)
  const bodyStr = method === 'GET' ? '' : JSON.stringify({ ...body, shop_id: token.shop_id })
  const sign = signShopee(partnerKey, partnerId, path, timestamp, token.access_token, token.shop_id, bodyStr)

  const url = `${getHost()}${path}?partner_id=${partnerId}&timestamp=${timestamp}&sign=${sign}&shop_id=${token.shop_id}&access_token=${token.access_token}`

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: method === 'GET' ? undefined : bodyStr,
    })
    const data = await res.json().catch(() => ({}))
    if (data.error) return { ok: false, error: data.message || data.error, data: data as any, http_status: res.status }
    return { ok: true, data: data as T, http_status: res.status }
  } catch (e: any) {
    return { ok: false, error: e.message }
  }
}

/**
 * Testa token buscando info da shop
 */
export async function testShopeeToken(companyId: string): Promise<{
  ok: boolean
  shop_info?: any
  error?: string
}> {
  const result = await callShopeeAPI<any>(companyId, '/api/v2/shop/get_shop_info', 'GET', {})
  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true, shop_info: result.data?.response }
}

/**
 * Retorna URL base do ambiente (útil pra debug)
 */
export function getShopeeEnvInfo() {
  return { env: getEnv(), host: getHost() }
}
