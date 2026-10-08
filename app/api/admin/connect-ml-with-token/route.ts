import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { testMLToken } from '@/lib/ml-auth-multi'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

/**
 * POST /api/admin/connect-ml-with-token
 * Body: {
 *   company_id: "uuid",
 *   access_token: "APP_USR-...",
 *   refresh_token: "TG-..." (opcional, mas necessário pra refresh),
 *   ml_user_id: 123456789
 * }
 *
 * Conecta uma empresa ao ML usando tokens já existentes.
 * Útil quando o user não consegue fazer o OAuth flow (rede bloqueada, etc).
 *
 * Se o access_token for válido, testa via /users/me e preenche o ml_user_id
 * automaticamente (se não informado).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { company_id, access_token, refresh_token, ml_user_id } = body

    if (!company_id || !access_token) {
      return NextResponse.json({
        ok: false,
        error: 'company_id e access_token obrigatórios. refresh_token e ml_user_id opcionais.',
      }, { status: 400 })
    }

    // Valida company
    const company: any[] = await prisma.$queryRawUnsafe(
      `SELECT id, nome_fantasia FROM companies WHERE id = $1::uuid`,
      company_id,
    )
    if (company.length === 0) {
      return NextResponse.json({ ok: false, error: 'Empresa não encontrada' }, { status: 404 })
    }

    // Testa o access_token
    const test = await testMLToken(access_token)
    if (!test.ok) {
      return NextResponse.json({ ok: false, error: `Token inválido: ${test.error}` }, { status: 500 })
    }

    const realMlUserId = ml_user_id || test.user_id
    const expiresAt = new Date(Date.now() + 6 * 60 * 60 * 1000) // 6h

    // Salva em companies
    await prisma.$queryRawUnsafe(`
      UPDATE companies SET
        access_token_ml = $2,
        refresh_token_ml = $3,
        ml_expires_at = $4,
        ml_user_id = $5,
        updated_at = NOW()
      WHERE id = $1::uuid
    `, company_id, access_token, refresh_token || null, expiresAt, realMlUserId)

    // Cria/vincula marketplace_accounts
    const existingAccount = await prisma.marketplace_accounts.findFirst({
      where: { company_id, plataforma: 'mercado_livre' },
    })
    if (existingAccount) {
      await prisma.marketplace_accounts.update({
        where: { id: existingAccount.id },
        data: {
          account_id: String(realMlUserId),
          nickname: test.nickname || existingAccount.nickname,
          access_token,
          refresh_token: refresh_token || existingAccount.refresh_token,
          token_expira_em: expiresAt,
          ativa: true,
          updated_at: new Date(),
        },
      })
    } else {
      await prisma.marketplace_accounts.create({
        data: {
          plataforma: 'mercado_livre',
          company_id,
          account_id: String(realMlUserId),
          nickname: test.nickname || `ML-${realMlUserId}`,
          access_token,
          refresh_token: refresh_token || null,
          token_expira_em: expiresAt,
          ativa: true,
        },
      })
    }

    return NextResponse.json({
      ok: true,
      message: `✅ Conectado! Conta ML: ${test.nickname} (${test.user_id})`,
      company: company[0],
      ml_account: {
        user_id: test.user_id,
        nickname: test.nickname,
        expires_at: expiresAt,
      },
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}