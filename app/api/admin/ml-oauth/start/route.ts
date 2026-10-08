import { NextRequest, NextResponse } from 'next/server'
import { getMLAuthUrl } from '@/lib/ml-auth-multi'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/ml-oauth/start?company_id=X
 *
 * Gera URL OAuth do Mercado Livre pra empresa X conectar a conta ML dela.
 * Redireciona o user pro ML autorizar.
 *
 * O ML redireciona de volta pra /api/admin/ml-oauth/callback?code=XXX&state=X
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const companyId = searchParams.get('company_id')

  if (!companyId) {
    return NextResponse.json({ ok: false, error: 'company_id obrigatório' }, { status: 400 })
  }

  // Valida company
  const company: any[] = await prisma.$queryRawUnsafe(
    `SELECT id, nome_fantasia, account_type FROM companies WHERE id = $1::uuid`,
    companyId,
  )
  if (company.length === 0) {
    return NextResponse.json({ ok: false, error: 'Empresa não encontrada' }, { status: 404 })
  }

  // Determina redirect_uri (callback) — usa origin do request
  const origin = new URL(req.url).origin
  const redirectUri = `${origin}/api/admin/ml-oauth/callback`

  // Gera URL OAuth — redireciona DIRETO pro ML (sem proxy reverso)
  // O proxy reverso estava sendo bloqueado por Cloudflare anti-bot
  const authUrl = getMLAuthUrl(companyId, redirectUri)

  return NextResponse.redirect(authUrl)
}