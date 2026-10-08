/**
 * POST /api/admin/reset-parceiro-password
 *
 * Reseta a senha de um user parceiro pra uma senha temporária.
 * Retorna a senha temporária (em texto puro, pra você passar pro parceiro).
 *
 * Body: { user_id?: string, email?: string, new_password: string }
 *
 * ⚠️ Use com cuidado — gera senha em texto puro.
 */
import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { isMatrizRequest } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// REVISADO (24/07/2026): resetar senha de qualquer usuário é uma ação
// sensível que antes não tinha checagem própria — agora exclusiva da matriz.
export async function POST(req: NextRequest) {
  if (!isMatrizRequest(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized — ação restrita à matriz' }, { status: 401 })
  }
  try {
    const body = await req.json()
    const { user_id, email, new_password } = body

    if (!new_password || new_password.length < 6) {
      return NextResponse.json({
        ok: false,
        error: 'new_password obrigatório (mínimo 6 chars)',
      }, { status: 400 })
    }

    if (!user_id && !email) {
      return NextResponse.json({
        ok: false,
        error: 'Precisa user_id OU email',
      }, { status: 400 })
    }

    // Acha o user (raw SQL pra evitar problema com select unknown)
    const where: any = {}
    if (user_id) where.id = user_id
    if (email) where.email = email

    const userRes: any[] = await prisma.$queryRawUnsafe(`
      SELECT u.id::text AS id, u.nome, u.email, u.company_id::text AS company_id,
             c.nome_fantasia, c.cnpj
      FROM users u
      LEFT JOIN companies c ON c.id = u.company_id
      WHERE ${user_id ? 'u.id = $1::uuid' : 'LOWER(u.email) = LOWER($1)'}
      LIMIT 1
    `, user_id || email)
    const user = userRes[0]
    if (!user) {
      return NextResponse.json({ ok: false, error: 'User não encontrado' }, { status: 404 })
    }

    // Hash e salva via SQL puro (evita problema com enums do Prisma)
    const hash = await bcrypt.hash(new_password, 10)
    await prisma.$executeRawUnsafe(
      `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2::uuid`,
      hash,
      user.id,
    )

    return NextResponse.json({
      ok: true,
      message: `Senha de ${user.email} atualizada.`,
      user: {
        id: user.id,
        nome: user.nome,
        email: user.email,
        company_id: user.company_id,
        company_name: user.nome_fantasia,
        company_cnpj: user.cnpj,
      },
      new_password, // retorna pra você copiar e mandar pro parceiro
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}