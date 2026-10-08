import { NextRequest, NextResponse } from 'next/server'
import { verifySessionToken, getCookieName } from '@/lib/auth-parceiro'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/reset-custos-parceiro
 *
 * ZERA (deleta) todos os product_prices de uma empresa parceira.
 * Pra resetar o cadastro de custos e começar do zero.
 *
 * Body opcional: { company_id?: string }  — se omitido, usa o cookie
 *
 * ⚠️ IRREVERSÍVEL — usa com cuidado!
 */

function getCompanyIdFromCookie(req: NextRequest): string | null {
  const token = req.cookies.get(getCookieName())?.value
  if (token) {
    const session = verifySessionToken(token)
    if (session) return session.companyId
  }
  const active = req.cookies.get('psh_session_company')?.value
  return active || null
}

export async function POST(req: NextRequest) {
  try {
    let companyId: string | null = null

    // Aceita company_id no body OU cookie
    try {
      const body = await req.json()
      if (body.company_id) companyId = body.company_id
    } catch { /* sem body */ }

    if (!companyId) companyId = getCompanyIdFromCookie(req)

    if (!companyId) {
      return NextResponse.json({ ok: false, error: 'company_id não fornecido e cookie ausente' }, { status: 400 })
    }

    // Conta antes de deletar
    const before: any[] = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS total FROM product_prices WHERE company_id = $1::uuid`,
      companyId,
    )

    // Deleta
    await prisma.$queryRawUnsafe(
      `DELETE FROM product_prices WHERE company_id = $1::uuid`,
      companyId,
    )

    // Pega nome da empresa pra log
    const company: any[] = await prisma.$queryRawUnsafe(
      `SELECT nome_fantasia, cnpj FROM companies WHERE id = $1::uuid`,
      companyId,
    )

    return NextResponse.json({
      ok: true,
      message: `Removidos ${before[0]?.total || 0} product_prices de ${company[0]?.nome_fantasia || companyId}`,
      deletados: before[0]?.total || 0,
      company: company[0],
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}