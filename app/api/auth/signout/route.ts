import { NextRequest, NextResponse } from 'next/server'
import { getCookieName } from '@/lib/auth-parceiro'

export const dynamic = 'force-dynamic'

/**
 * POST /api/auth/signout — limpa todos os cookies de sessão
 */
export async function POST(req: NextRequest) {
  const res = NextResponse.json({ ok: true, message: 'Sessão encerrada' })
  res.cookies.delete(getCookieName())
  res.cookies.delete('psh_session_company')
  res.cookies.delete('psh_session_role')
  res.cookies.delete('psh_active_company')
  return res
}