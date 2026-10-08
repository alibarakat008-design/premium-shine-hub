import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getMLAuthUrl } from '@/lib/ml-auth-multi'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * GET /api/public/ml-auth-bridge?company_id=X
 *
 * BRIDGE de OAuth ML que:
 * 1. Detecta a company
 * 2. Gera URL OAuth ML
 * 3. Faz request SERVER-SIDE pro proxy reverso (com Basic Auth interna)
 * 4. Devolve pro browser o HTML/redirect correto
 *
 * O browser do user NÃO precisa autenticar com Basic Auth
 * porque o server-side faz isso.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const companyId = searchParams.get('company_id')

  if (!companyId) {
    return NextResponse.json({ ok: false, error: 'company_id obrigatório' }, { status: 400 })
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

  // Gera URL OAuth direta do ML
  const directAuthUrl = getMLAuthUrl(companyId, realRedirectUri)
  const authUrl = new URL(directAuthUrl)

  // Constrói a URL PROXY que carrega a página de auth (com headers de navegador)
  const proxyAuthUrl = `${origin}/api/proxy/ml/${authUrl.hostname.split('.')[0]}${authUrl.pathname}${authUrl.search}`

  // Faz request SERVER-SIDE pro proxy (com Basic Auth interna)
  const proxyRes = await fetch(proxyAuthUrl, {
    method: 'GET',
    headers: {
      // Auth interna (Basic) — nosso proxy aceita isso
      Authorization: 'Basic ' + Buffer.from('premium:shine2026').toString('base64'),
      // Headers de navegador pra ML não bloquear
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
      'Cookie': '',  // sem cookie de ML
    },
    redirect: 'manual',
  })

  console.log(`[ml-auth-bridge] company=${companyId} proxy status=${proxyRes.status}`)

  // Se proxy retornou redirect (302/307), segue o Location
  if (proxyRes.status >= 300 && proxyRes.status < 400) {
    const location = proxyRes.headers.get('location')
    if (location) {
      console.log(`[ml-auth-bridge] proxy redirect → ${location.substring(0, 200)}`)
      // Reescreve Location pra usar o proxy (não o ML direto)
      // Se location for do ML, troca pelo proxy correspondente
      let newLocation = location
      try {
        const loc = new URL(location, origin)
        if (loc.hostname.endsWith('.mercadolivre.com.br') || loc.hostname.endsWith('.mercadol.com')) {
          const sub = loc.hostname.split('.')[0]
          newLocation = `${origin}/api/proxy/ml/${sub}${loc.pathname}${loc.search}`
        }
      } catch {}

      return NextResponse.redirect(newLocation)
    }
  }

  // Se proxy retornou HTML (200), devolve pro user
  const body = await proxyRes.text()
  const contentType = proxyRes.headers.get('content-type') || 'text/html'

  return new NextResponse(body, {
    status: proxyRes.status,
    headers: { 'Content-Type': contentType },
  })
}