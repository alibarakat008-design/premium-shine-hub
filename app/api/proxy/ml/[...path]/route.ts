import { NextRequest, NextResponse } from 'next/server'

/**
 * Proxy reverso pra mercadolivre.com.br (auth.mercadolivre.com.br e www.mercadolivre.com)
 *
 * Reescreve TUDO (Location headers, forms) pra continuar via proxy.
 * Auth: cookie psh_auth_token OU Basic Auth.
 *
 * IMPORTANTE: NÃO encaminha headers de auth do nosso sistema pro ML
 * (Authorization, Cookie do nosso domínio). ML usa Cloudflare CDN com bloqueio
 * de User-Agents e headers incomuns.
 */

export const dynamic = 'force-dynamic'
export const maxDuration = 30

function checkAuth(req: NextRequest): NextResponse | null {
  const token = req.cookies.get('psh_auth_token')?.value
  const role = req.cookies.get('psh_session_role')?.value
  const authHeader = req.headers.get('authorization')
  if (token || role === 'matriz' || role === 'parceiro' || role === 'filial') return null
  if (authHeader === `Basic ${Buffer.from('premium:shine2026').toString('base64')}`) return null
  return new NextResponse('Login necessário', { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="ML Proxy"' } })
}

function resolveTarget(req: NextRequest): { host: string; path: string } | null {
  const url = new URL(req.url)
  const after = url.pathname.replace(/^\/api\/proxy\/ml\//, '')
  const parts = after.split('/')
  const subdomain = parts[0]
  const restPath = '/' + parts.slice(1).join('/')
  if (!subdomain) return null
  return { host: `${subdomain}.mercadolivre.com.br`, path: restPath }
}

function rewrite(url: string, baseOrigin: string): string {
  if (!url) return url
  if (url.startsWith(baseOrigin + '/api/proxy/ml/')) return url
  if (url.startsWith('#') || url.startsWith('javascript:') || url.startsWith('mailto:') || url.startsWith('tel:') || url.startsWith('data:') || url.startsWith('about:')) return url
  try {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      const u = new URL(url)
      const hostname = u.hostname
      if (hostname.endsWith('.mercadolivre.com.br')) {
        const sub = hostname.split('.')[0]
        return baseOrigin + '/api/proxy/ml/' + sub + u.pathname + u.search
      }
      if (hostname === 'mercadolivre.com' || hostname.endsWith('.mercadolivre.com')) {
        const sub = hostname.split('.')[0]
        return baseOrigin + '/api/proxy/ml/' + sub + u.pathname + u.search
      }
      return url
    }
    if (url.startsWith('/')) {
      return baseOrigin + '/api/proxy/ml/www' + url
    }
    return url
  } catch {
    return url
  }
}

export async function GET(req: NextRequest) {
  const unauth = checkAuth(req)
  if (unauth) return unauth
  return forwardRequest(req)
}
export async function POST(req: NextRequest) {
  const unauth = checkAuth(req)
  if (unauth) return unauth
  return forwardRequest(req)
}

// Headers que NÃO devem ser enviados pro ML
const HOP_BY_HOP = new Set([
  'host', 'connection', 'content-length', 'content-encoding',
  'authorization', // NUNCA repassar nossa auth pro ML
  'transfer-encoding', 'upgrade',
])

// Headers que DEVEM ir pro ML (mesmo se vierem vazios)
const REQUIRED_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
}

async function forwardRequest(req: NextRequest): Promise<NextResponse> {
  const target = resolveTarget(req)
  if (!target) return NextResponse.json({ ok: false, error: 'URL inválida' }, { status: 400 })

  const url = new URL(req.url)
  const targetUrl = `https://${target.host}${target.path}${url.search}`
  const baseOrigin = url.origin

  try {
    const headers = new Headers()
    for (const [key, value] of req.headers.entries()) {
      if (HOP_BY_HOP.has(key.toLowerCase())) continue
      // Filtra headers que podem interferir com Cloudflare
      if (['sec-fetch-mode', 'sec-fetch-site', 'sec-fetch-user', 'sec-fetch-dest'].includes(key.toLowerCase())) continue
      headers.set(key, value)
    }
    // Set headers obrigatórios pra ML aceitar
    for (const [k, v] of Object.entries(REQUIRED_HEADERS)) {
      headers.set(k, v)
    }
    // Removendo sec-fetch-* que podem identificar como não-navegador
    headers.delete('Sec-Fetch-Mode')
    headers.delete('Sec-Fetch-Site')
    headers.delete('Sec-Fetch-Dest')
    headers.delete('Sec-Fetch-User')
    // Adiciona headers Cloudflare-friendly
    headers.set('Host', target.host)
    headers.set('Origin', `https://${target.host}`)
    headers.set('Referer', `https://${target.host}/`)
    headers.set('Sec-Fetch-Mode', 'navigate')
    headers.set('Sec-Fetch-Site', 'same-origin')
    headers.set('Sec-Fetch-Dest', 'document')

    let body: BodyInit | undefined = undefined
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      // Pega form-urlencoded / json / etc como texto
      body = await req.text()
    }

    const mlRes = await fetch(targetUrl, {
      method: req.method,
      headers,
      body,
      redirect: 'manual',
    })

    // Ler body (pode estar comprimido)
    const arrayBuf = await mlRes.arrayBuffer()
    const contentEncoding = mlRes.headers.get('content-encoding')
    let bodyText: string
    try {
      if (contentEncoding === 'br' && typeof (globalThis as any).BrotliDecompress === 'function') {
        const decompressed = (globalThis as any).BrotliDecompress(new Uint8Array(arrayBuf))
        bodyText = new TextDecoder('utf-8').decode(decompressed)
      } else if (contentEncoding === 'gzip') {
        const zlib = require('zlib')
        bodyText = zlib.gunzipSync(Buffer.from(arrayBuf)).toString('utf-8')
      } else if (contentEncoding === 'deflate') {
        const zlib = require('zlib')
        bodyText = zlib.inflateSync(Buffer.from(arrayBuf)).toString('utf-8')
      } else {
        bodyText = new TextDecoder('utf-8').decode(new Uint8Array(arrayBuf))
      }
    } catch {
      bodyText = new TextDecoder('utf-8').decode(new Uint8Array(arrayBuf))
    }

    const responseHeaders = new Headers()
    for (const [key, value] of mlRes.headers.entries()) {
      if (['content-encoding', 'content-length', 'transfer-encoding', 'connection'].includes(key.toLowerCase())) continue
      // Reescreve Location em redirect headers
      if (key.toLowerCase() === 'location') {
        responseHeaders.set('Location', rewrite(value, baseOrigin))
        continue
      }
      responseHeaders.set(key, value)
    }
    responseHeaders.set('Cache-Control', 'no-store, no-cache, must-revalidate')
    responseHeaders.set('X-Frame-Options', 'SAMEORIGIN')
    responseHeaders.delete('Content-Security-Policy')
    responseHeaders.delete('X-Content-Security-Policy')

    // Reescreve HTML body: forms, scripts, links
    const contentType = responseHeaders.get('content-type') || ''
    if (contentType.includes('text/html') || contentType.includes('text/css')) {
      bodyText = bodyText.replace(
        /(<form[^>]*?\saction=)(["'])([^"']+?)\2/gi,
        (_, prefix, quote, action) => prefix + quote + rewrite(action, baseOrigin) + quote
      )
      bodyText = bodyText.replace(
        /((?:href|src|formaction|data-href|data-src|action)\s*=\s*)(["'])([^"']+?)\2/gi,
        (_, prefix, quote, urlStr) => prefix + quote + rewrite(urlStr, baseOrigin) + quote
      )
      bodyText = bodyText.replace(
        /((?:window\.location(?:\.href)?|location\.href)\s*=\s*)(["'])([^"']+?)\2/g,
        (_, prefix, quote, urlStr) => prefix + quote + rewrite(urlStr, baseOrigin) + quote
      )
    }

    // 3xx: repassa Location reescrito (mas Location header já foi reescrito acima)
    if (mlRes.status >= 300 && mlRes.status < 400) {
      return new NextResponse(null, { status: mlRes.status, headers: responseHeaders })
    }

    // Re-comprimir? Não, enviamos sem compressão (Vercel vai comprimir)
    return new NextResponse(bodyText, { status: mlRes.status, headers: responseHeaders })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}