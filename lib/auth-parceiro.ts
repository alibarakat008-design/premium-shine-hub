/**
 * Auth helpers — multi-company
 *
 * Hash/compare de senhas com bcryptjs.
 * Sessão por cookie `psh_auth_token` (httpOnly).
 *
 * 2 tipos de sessão:
 *   - admin: via next-auth (cookie próprio do next-auth)
 *   - parceiro: via cookie `psh_auth_token` (user_id + company_id)
 */

import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'

const COOKIE_NAME = 'psh_auth_token'
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60 // 30 dias

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10)
}

export async function comparePassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}

export async function createSessionToken(userId: string, companyId: string): Promise<string> {
  // Token simples = base64(userId|companyId|timestamp|hmac)
  const ts = Date.now()
  const payload = `${userId}|${companyId}|${ts}`
  const crypto = require('crypto')
  const hmac = crypto
    .createHmac('sha256', process.env.AUTH_SECRET || 'psh-auth-secret-2026')
    .update(payload)
    .digest('hex')
    .slice(0, 32)
  return Buffer.from(`${payload}|${hmac}`).toString('base64')
}

export function verifySessionToken(token: string): { userId: string; companyId: string; ts: number } | null {
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf8')
    const parts = decoded.split('|')
    if (parts.length !== 4) return null
    const [userId, companyId, tsStr, hmac] = parts
    const ts = Number(tsStr)

    const crypto = require('crypto')
    const expectedHmac = crypto
      .createHmac('sha256', process.env.AUTH_SECRET || 'psh-auth-secret-2026')
      .update(`${userId}|${companyId}|${tsStr}`)
      .digest('hex')
      .slice(0, 32)

    if (hmac !== expectedHmac) return null
    if (Date.now() - ts > COOKIE_MAX_AGE * 1000) return null

    return { userId, companyId, ts }
  } catch {
    return null
  }
}

export function getCookieName(): string {
  return COOKIE_NAME
}

export function getCookieMaxAge(): number {
  return COOKIE_MAX_AGE
}

/**
 * Verifica sessão a partir dos cookies (helper para API routes serverless)
 * Retorna { userId, companyId, ts } ou null
 */
export function verifySessionFromCookies(cookies: { get(name: string): { value: string } | undefined }): { userId: string; companyId: string; ts: number } | null {
  const token = cookies.get(COOKIE_NAME)?.value
  if (!token) return null
  return verifySessionToken(token)
}