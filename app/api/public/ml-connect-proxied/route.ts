import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getMLAuthUrl } from '@/lib/ml-auth-multi'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * GET /api/public/ml-connect-proxied?company_id=X
 *
 * VERSÃO COM PROXY REVERSO — bypassa Cloudflare bot detection do ML.
 *
 * Em vez de redirecionar o user direto pra auth.mercadolivre.com.br/authorization
 * (que pode dar "não é possível acessar esse site" pq Cloudflare bloqueia),
 * redireciona pra um proxy nosso que faz a request com headers de navegador real.
 *
 * O redirect_uri continua sendo o callback real, então o ML valida normalmente.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const companyId = searchParams.get('company_id')

  if (!companyId) {
    return NextResponse.json({
      ok: false,
      error: 'company_id obrigatório. Use: /api/public/ml-connect-proxied?company_id=SEU-UUID',
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

  const origin = new URL(req.url).origin
  const realRedirectUri = `${origin}/api/admin/ml-oauth/callback`

  // Gera URL OAuth direta (mesma do método anterior)
  const directAuthUrl = getMLAuthUrl(companyId, realRedirectUri)

  // Em vez de redirecionar direto, redireciona pro PROXY reverso
  // que vai carregar a página de auth com headers de navegador real (bypassa Cloudflare)
  const proxyAuthUrl = directAuthUrl.replace('https://auth.mercadolivre.com.br', `${origin}/api/proxy/ml/auth`)

  console.log(`[ml-connect-proxied] company=${companyId} direct=${directAuthUrl} proxy=${proxyAuthUrl}`)

  // Fallback: se o replace não funcionou, construir manualmente
  const finalUrl = proxyAuthUrl.includes('/api/proxy/ml/auth')
    ? proxyAuthUrl
    : `${origin}/api/proxy/ml/auth/authorization?${new URL(directAuthUrl).searchParams.toString()}`

  return NextResponse.redirect(finalUrl)
}