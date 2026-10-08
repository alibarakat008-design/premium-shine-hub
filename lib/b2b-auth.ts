// /lib/b2b-auth.ts
// Auth B2B: gerencia sessão via cookie + hash de senha

import { prisma } from './prisma'
import crypto from 'crypto'
import { cookies } from 'next/headers'

const COOKIE_NAME = 'b2b_session'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30 // 30 dias

// Hash de senha simples (em produção, usar bcrypt)
export function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password + 'ps_b2b_salt_2026').digest('hex')
}

export function verifyPassword(password: string, hash: string): boolean {
  return hashPassword(password) === hash
}

export function setSession(b2b_client_id: string, email: string, nome: string) {
  const session = { b2b_client_id, email, nome, ts: Date.now() }
  const value = encodeURIComponent(JSON.stringify(session))
  cookies().set(COOKIE_NAME, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE,
    path: '/',
  })
}

export function getSession(): { b2b_client_id: string; email: string; nome: string } | null {
  try {
    const cookieStore = cookies()
    const value = cookieStore.get(COOKIE_NAME)?.value
    if (!value) return null
    return JSON.parse(decodeURIComponent(value))
  } catch {
    return null
  }
}

export function clearSession() {
  cookies().delete(COOKIE_NAME)
}

export async function requireB2b() {
  const session = getSession()
  if (!session) return null
  const client = await prisma.b2b_clients.findUnique({
    where: { id: session.b2b_client_id },
    select: { id: true, email: true, nome: true, empresa: true, plano: true, status: true, avatar_url: true },
  })
  return client
}
