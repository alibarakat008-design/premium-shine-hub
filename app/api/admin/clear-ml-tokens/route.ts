/**
 * POST /api/admin/clear-ml-tokens?company_id=X
 *
 * Limpa tokens ML (companies.access_token_ml/refresh_token_ml/ml_user_id)
 * e desativa a marketplace_accounts vinculada.
 *
 * Pra forçar reconexão OAuth com a conta ML CORRETA
 * (caso o user conectou a conta errada sem querer).
 *
 * NÃO deleta orders — só desconecta a conta ML.
 */
import { NextRequest, NextResponse } from 'next/server'
import { assertCompanyAccess } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// REVISADO (24/07/2026): antes qualquer sessão autenticada podia limpar o
// token de QUALQUER empresa passando o company_id de outra. Agora só a
// matriz ou a própria empresa (validada pelo token assinado) pode.
export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    let companyId: string | null = searchParams.get('company_id')
    try {
      const body = await req.json()
      if (!companyId && body?.company_id) companyId = body.company_id
    } catch {}

    if (!assertCompanyAccess(req, companyId)) {
      return NextResponse.json({ ok: false, error: 'Unauthorized para esta empresa' }, { status: 401 })
    }

    if (!companyId) {
      return NextResponse.json({ ok: false, error: 'company_id obrigatório' }, { status: 400 })
    }

    // 1) Limpa tokens em companies
    const updCompany = await prisma.$queryRawUnsafe(`
      UPDATE companies SET
        access_token_ml = NULL,
        refresh_token_ml = NULL,
        ml_expires_at = NULL,
        ml_user_id = NULL,
        updated_at = NOW()
      WHERE id = $1::uuid
      RETURNING nome_fantasia
    `, companyId)

    // 2) Desativa marketplace_accounts dessa empresa
    const updAccounts = await prisma.marketplace_accounts.updateMany({
      where: { company_id: companyId },
      data: { ativa: false, access_token: null, refresh_token: null },
    })

    return NextResponse.json({
      ok: true,
      message: `Tokens ML removidos de ${updCompany[0]?.nome_fantasia || companyId}. Reconecte via OAuth.`,
      company: updCompany[0],
      accounts_desativadas: updAccounts.count,
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}