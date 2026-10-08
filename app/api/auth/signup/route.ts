import { NextRequest, NextResponse } from 'next/server'
import { hashPassword, createSessionToken, getCookieName, getCookieMaxAge } from '@/lib/auth-parceiro'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * POST /api/auth/signup
 * Body: {
 *   cnpj, razao_social, nome_fantasia, email, telefone,
 *   password, nome_usuario (opcional, default = nome_fantasia)
 * }
 *
 * Cria:
 *   - companies (account_type='parceiro')
 *   - users (role='empresa_owner', company_id=<novo>)
 *
 * Loga o user automaticamente (seta cookie psh_auth_token).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { cnpj, razao_social, nome_fantasia, email, telefone, password, nome_usuario } = body

    if (!cnpj || !razao_social || !email || !password) {
      return NextResponse.json({
        ok: false,
        error: 'Campos obrigatórios: cnpj, razao_social, email, password',
      }, { status: 400 })
    }

    if (password.length < 6) {
      return NextResponse.json({
        ok: false,
        error: 'Senha deve ter no mínimo 6 caracteres',
      }, { status: 400 })
    }

    const cnpjDigits = cnpj.replace(/\D/g, '')
    if (cnpjDigits.length !== 14) {
      return NextResponse.json({
        ok: false,
        error: 'CNPJ deve ter 14 dígitos',
      }, { status: 400 })
    }

    // Verifica email duplicado
    const emailLower = String(email).toLowerCase().trim()
    const emailExists: any[] = await prisma.$queryRawUnsafe(
      `SELECT id FROM users WHERE LOWER(email) = $1 LIMIT 1`,
      emailLower,
    )
    if (emailExists.length > 0) {
      return NextResponse.json({
        ok: false,
        error: `Email ${emailLower} já cadastrado. Faça login ou use outro email.`,
      }, { status: 409 })
    }

    // Verifica CNPJ duplicado
    const cnpjExists: any[] = await prisma.$queryRawUnsafe(
      `SELECT id FROM companies WHERE cnpj = $1 LIMIT 1`,
      cnpj,
    )
    if (cnpjExists.length > 0) {
      return NextResponse.json({
        ok: false,
        error: `CNPJ ${cnpj} já cadastrado por outra empresa. Fale com o suporte.`,
      }, { status: 409 })
    }

    // Hash da senha
    const passwordHash = await hashPassword(password)

    // Cria company primeiro
    const companyRes: any = await prisma.$queryRawUnsafe(`
      INSERT INTO companies (cnpj, razao_social, nome_fantasia, email, telefone, account_type, ativa)
      VALUES ($1, $2, $3, $4, $5, 'parceiro', true)
      RETURNING id, cnpj, razao_social, nome_fantasia, email, account_type, ativa
    `, cnpj, razao_social, nome_fantasia || null, emailLower, telefone || null)

    const company = companyRes[0]

    // Cria user
    const userNome = nome_usuario || nome_fantasia || razao_social
    const userRes: any = await prisma.$queryRawUnsafe(`
      INSERT INTO users (email, password_hash, nome, telefone, cpf_cnpj, role, ativo, company_id)
      VALUES ($1, $2, $3, $4, $5, 'empresa_owner', true, $6::uuid)
      RETURNING id, email, nome, role, company_id, created_at
    `, emailLower, passwordHash, userNome, telefone || null, cnpjDigits, company.id)

    const user = userRes[0]

    // Cria session token
    const token = await createSessionToken(user.id, company.id)

    // Seta cookie + sessão multi-tenant
    const res = NextResponse.json({
      ok: true,
      message: '🎉 Cadastro realizado com sucesso!',
      user: { id: user.id, email: user.email, nome: user.nome },
      company: {
        id: company.id,
        nome: company.nome_fantasia || company.razao_social,
        cnpj: company.cnpj,
        account_type: company.account_type,
      },
    })

    res.cookies.set(getCookieName(), token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: getCookieMaxAge(),
      path: '/',
    })

    // Também seta session multi-tenant (que controla o filtro de empresa)
    res.cookies.set('psh_session_company', company.id, {
      httpOnly: false,
      sameSite: 'lax',
      maxAge: getCookieMaxAge(),
      path: '/',
    })
    res.cookies.set('psh_session_role', 'parceiro', {
      httpOnly: false,
      sameSite: 'lax',
      maxAge: getCookieMaxAge(),
      path: '/',
    })
    res.cookies.set('psh_active_company', company.id, {
      httpOnly: false,
      sameSite: 'lax',
      maxAge: getCookieMaxAge(),
      path: '/',
    })

    return res
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}