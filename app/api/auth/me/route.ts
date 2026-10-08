// /app/api/auth/me/route.ts
// Retorna user atual + company — via Prisma (sem Management API)
import { NextRequest, NextResponse } from 'next/server'
import { verifySessionToken, getCookieName } from '@/lib/auth-parceiro'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * GET /api/auth/me — retorna user atual + company
 * Lê cookie psh_auth_token (parceiro) OU fallback via psh_session_company
 */
export async function GET(req: NextRequest) {
  // 1) Parceiro logado via token
  const token = req.cookies.get(getCookieName())?.value
  if (token) {
    const session = verifySessionToken(token)
    if (session) {
      try {
        const user = await prisma.users.findUnique({
          where: { id: session.userId },
          select: {
            id: true,
            email: true,
            nome: true,
            role: true,
            avatar_url: true,
            ativo: true,
          },
        })

        if (user) {
          return NextResponse.json({
            ok: true,
            user: {
              id: user.id,
              email: user.email,
              nome: user.nome,
              role: user.role,
              avatar_url: user.avatar_url,
              company_id: user.id,
            },
            company: {
              id: user.id,
              nome: user.nome,
              account_type: user.role,
            },
          })
        }
      } catch (e: any) {
        console.error('[me] error:', e.message)
      }
    }
  }

  // 2) Fallback: session company/role via cookies
  const sessionCompanyId = req.cookies.get('psh_session_company')?.value
  const sessionRole = req.cookies.get('psh_session_role')?.value
  if (sessionCompanyId && (sessionRole === 'matriz' || sessionRole === 'filial' || sessionRole === 'parceiro' || sessionRole === 'admin')) {
    try {
      const user = await prisma.users.findUnique({
        where: { id: sessionCompanyId },
        select: {
          id: true,
          email: true,
          nome: true,
          role: true,
          ativo: true,
        },
      })
      if (user) {
        return NextResponse.json({
          ok: true,
          user: {
            id: user.id,
            email: user.email,
            nome: user.nome,
            role: user.role,
            company_id: user.id,
          },
          company: {
            id: user.id,
            nome: user.nome,
            account_type: user.role,
          },
        })
      }
    } catch (e: any) {
      console.error('[me] fallback error:', e.message)
    }
  }

  return NextResponse.json({
    ok: true,
    user: null,
    isAdmin: true,
    message: 'Não autenticado',
  })
}
