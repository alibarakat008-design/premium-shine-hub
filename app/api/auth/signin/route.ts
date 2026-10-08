// /app/api/auth/signin/route.ts
// Login via Prisma (direct DB connection via pooler)
import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { createSessionToken, getCookieName, getCookieMaxAge } from '@/lib/auth-parceiro'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { email, password } = body

    if (!email || !password) {
      return NextResponse.json({
        ok: false,
        error: 'Email e senha são obrigatórios',
      }, { status: 400 })
    }

    const emailLower = String(email).toLowerCase().trim()

    // Busca user via Prisma
    const user = await prisma.users.findUnique({
      where: { email: emailLower },
    })

    if (!user) {
      return NextResponse.json({
        ok: false,
        error: 'Email ou senha incorretos',
      }, { status: 401 })
    }

    if (!user.ativo) {
      return NextResponse.json({
        ok: false,
        error: 'Conta desativada. Fale com o suporte.',
      }, { status: 403 })
    }

    if (!user.password_hash) {
      return NextResponse.json({
        ok: false,
        error: 'Conta sem senha cadastrada. Fale com o suporte.',
      }, { status: 401 })
    }

    // Verifica senha com bcryptjs (funciona no serverless)
    const senhaOk = await bcrypt.compare(password, user.password_hash)
    if (!senhaOk) {
      return NextResponse.json({
        ok: false,
        error: 'Email ou senha incorretos',
      }, { status: 401 })
    }

    const isAdmin = user.role === 'admin'

    // Cria session token
    const token = await createSessionToken(user.id, user.id)

    // Atualiza last_login
    await prisma.users.update({
      where: { id: user.id },
      data: { last_login: new Date() },
    }).catch(() => {}) // não falha se não conseguir atualizar

    const res = NextResponse.json({
      ok: true,
      message: isAdmin ? `Bem-vindo de volta, ${user.nome}!` : `Olá ${user.nome}!`,
      user: { id: user.id, email: user.email, nome: user.nome, role: user.role },
      redirect: isAdmin ? '/admin/vendas-ao-vivo' : '/admin/dashboard-parceiro',
    })

    res.cookies.set(getCookieName(), token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: getCookieMaxAge(),
      path: '/',
    })
    res.cookies.set('psh_session_company', user.id, {
      httpOnly: false,
      sameSite: 'lax',
      maxAge: getCookieMaxAge(),
      path: '/',
    })
    res.cookies.set('psh_session_role', user.role, {
      httpOnly: false,
      sameSite: 'lax',
      maxAge: getCookieMaxAge(),
      path: '/',
    })
    res.cookies.set('psh_active_company', user.id, {
      httpOnly: false,
      sameSite: 'lax',
      maxAge: getCookieMaxAge(),
      path: '/',
    })

    return res
  } catch (e: any) {
    console.error('[signin] error:', e.message)
    return NextResponse.json({ ok: false, error: 'Erro interno. Tente novamente.' }, { status: 500 })
  }
}
