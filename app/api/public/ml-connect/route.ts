import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getMLAuthUrl } from '@/lib/ml-auth-multi'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * GET /api/public/ml-connect?company_id=X
 *
 * Endpoint PÚBLICO (sem Basic Auth) que redireciona pro OAuth ML.
 * O state da URL é o company_id — quando o ML volta pro callback,
 * o sistema sabe qual empresa está conectando.
 *
 * Use quando o parceiro não consegue autenticar com Basic Auth
 * (caso da GH Shop que não tem mais credenciais master).
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const companyId = searchParams.get('company_id')

  if (!companyId) {
    return NextResponse.json({
      ok: false,
      error: 'company_id obrigatório. Use: /api/public/ml-connect?company_id=SEU-UUID',
    }, { status: 400 })
  }

  // Valida company
  const company: any[] = await prisma.$queryRawUnsafe(
    `SELECT id, nome_fantasia FROM companies WHERE id = $1::uuid`,
    companyId,
  )
  if (company.length === 0) {
    return NextResponse.json({ ok: false, error: 'Empresa não encontrada' }, { status: 404 })
  }

  // Determina redirect_uri (callback)
  const origin = new URL(req.url).origin
  const redirectUri = `${origin}/api/admin/ml-oauth/callback`

  // Gera URL OAuth
  const authUrl = getMLAuthUrl(companyId, redirectUri)

  // Redireciona direto pro ML
  return NextResponse.redirect(authUrl)
}