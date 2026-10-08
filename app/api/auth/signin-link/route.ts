/**
 * GET /api/auth/signin-link
 *
 * Login via URL — usado pra enviar link direto pro parceiro.
 * Recebe credenciais na URL, valida, seta cookies oficiais, redireciona.
 *
 * Query: ?email=X&password=Y&redirect=/admin
 *
 * NOTA: colocar senha em URL não é seguro pra produção.
 *       Use so pra gerar links one-time pro parceiro.
 *       O link tem o user_id + company_id embutidos (nao precisa senha)
 *       mas a validação eh por senha.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { comparePassword, createSessionToken, getCookieName, getCookieMaxAge } from '@/lib/auth-parceiro'
import crypto from 'crypto'

const AUTH_SECRET = process.env.AUTH_SECRET || 'psh-auth-secret-2026'

export const dynamic = 'force-dynamic'

function generateToken(companyId: string, date: string): string {
  return crypto
    .createHmac('sha256', AUTH_SECRET)
    .update(`signin-link|${companyId}|${date}`)
    .digest('hex')
    .slice(0, 24)
}

function verifyToken(companyId: string, date: string, token: string): boolean {
  return generateToken(companyId, date) === token
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const email = searchParams.get('email')
  const password = searchParams.get('password')
  const redirect = searchParams.get('redirect') || '/admin/dashboard-parceiro'
  const date = searchParams.get('date') || new Date().toISOString().substring(0, 10)
  const token = searchParams.get('token')

  if (!email || !password) {
    return NextResponse.json({ ok: false, error: 'email e password obrigatorios' }, { status: 400 })
  }

  try {
    // Valida token (proteção contra URLs forjadas)
    // Token é gerado pelo admin ao compartilhar o link
    const emailLower = String(email).toLowerCase().trim()

    // Busca user
    const userRes: any[] = await prisma.$queryRawUnsafe(`
      SELECT u.id, u.email, u.nome, u.password_hash, u.role, u.company_id, u.ativo,
             c.nome_fantasia AS company_name, c.account_type AS company_type
      FROM users u
      LEFT JOIN companies c ON c.id = u.company_id
      WHERE LOWER(u.email) = $1
      LIMIT 1
    `, emailLower)
    if (userRes.length === 0) {
      return NextResponse.json({ ok: false, error: 'User nao encontrado' }, { status: 401 })
    }
    const user = userRes[0]
    if (!user.company_id) {
      return NextResponse.json({ ok: false, error: 'User sem company' }, { status: 400 })
    }

    // Valida token (opcional mas recomendado)
    if (token && !verifyToken(user.company_id, date, token)) {
      return NextResponse.json({ ok: false, error: 'Token invalido ou expirado' }, { status: 401 })
    }

    // Valida senha
    if (!user.password_hash) {
      return NextResponse.json({ ok: false, error: 'Conta sem senha' }, { status: 401 })
    }
    const senhaOk = await comparePassword(password, user.password_hash)
    if (!senhaOk) {
      return NextResponse.json({ ok: false, error: 'Senha incorreta' }, { status: 401 })
    }

    const companyId = user.company_id
    const role = user.company_type || 'parceiro'
    const isMatriz = role === 'matriz'

    // Cria session token oficial
    const authToken = await createSessionToken(user.id, companyId)

    await prisma.$queryRawUnsafe(`UPDATE users SET last_login = NOW() WHERE id = $1::uuid`, user.id)

    const origin = new URL(req.url).origin
    const target = redirect.startsWith('http') ? redirect : `${origin}${redirect}`

    const response = NextResponse.redirect(target, { status: 302 })
    response.cookies.set(getCookieName(), authToken, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: getCookieMaxAge(),
      path: '/',
    })
    response.cookies.set('psh_session_company', companyId, {
      httpOnly: false,
      sameSite: 'lax',
      maxAge: getCookieMaxAge(),
      path: '/',
    })
    response.cookies.set('psh_session_role', role, {
      httpOnly: false,
      sameSite: 'lax',
      maxAge: getCookieMaxAge(),
      path: '/',
    })
    if (!isMatriz) {
      response.cookies.set('psh_active_company', companyId, {
        httpOnly: false,
        sameSite: 'lax',
        maxAge: getCookieMaxAge(),
        path: '/',
      })
    }
    response.cookies.set('psh_session_company_name', user.company_name || '', {
      httpOnly: false,
      sameSite: 'lax',
      maxAge: getCookieMaxAge(),
      path: '/',
    })
    response.cookies.set('psh_session_email', user.email, {
      httpOnly: false,
      sameSite: 'lax',
      maxAge: getCookieMaxAge(),
      path: '/',
    })

    return response
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}
