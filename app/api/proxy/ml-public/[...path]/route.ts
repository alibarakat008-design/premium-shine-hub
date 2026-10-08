import { NextRequest, NextResponse } from 'next/server'

/**
 * Proxy reverso MELHORADO pra mercadolivre.com.br
 * - Sem auth (vendor acessa direto)
 * - Headers mais completos pra bypassar Cloudflare bot detection
 * - Suporta OAuth flow completo
 */

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function resolveTarget(req: NextRequest): { host: string; path: string } | null {
  const url = new URL(req.url)
  const after = url.pathname.replace(/^\/api\/proxy\/ml-public\//, '')
  const parts = after.split('/').filter(Boolean)
  if (parts.length === 0) return null
  const subdomain = parts[0]
  const restPath = '/' + parts.slice(1).join('/')
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

// Headers que NÃO devem ser enviados pro ML
const HOP_BY_HOP = new Set([
  'host', 'connection', 'content-length', 'content-encoding',
  'authorization',
  'transfer-encoding', 'upgrade',
])

// Headers que DEVEM ir pro ML — NUVEM COMPLETA pra parecer navegador real
const REQUIRED_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
  'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
  'Accept-Encoding': 'gzip, deflate, br, zstd',
  'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'sec-fetch-dest': 'document',
  'sec-fetch-mode': 'navigate',
  'sec-fetch-site': 'none',
  'sec-fetch-user': '?1',
  'upgrade-insecure-requests': '1',
  'cache-control': 'max-age=0',
}

async function forwardRequest(req: NextRequest): Promise<NextResponse> {
  const target = resolveTarget(req)
  if (!target) return NextResponse.json({ ok: false, error: 'URL inválida' }, { status: 400 })

  const url = new URL(req.url)
  const targetUrl = `https://${target.host}${target.path}${url.search}`
  const baseOrigin = url.origin

  console.log(`[proxy-ml] ${req.method} ${url.pathname}${url.search} -> ${targetUrl}`)

  try {
    const headers = new Headers()
    // Copia headers do request mas FILTRA os que podem identificar como bot
    for (const [key, value] of req.headers.entries()) {
      if (HOP_BY_HOP.has(key.toLowerCase())) continue
      headers.set(key, value)
    }
    // Seta headers obrigatórios
    for (const [k, v] of Object.entries(REQUIRED_HEADERS)) {
      headers.set(k, v)
    }
    // Set Host, Origin, Referer pra ML
    headers.set('Host', target.host)
    headers.set('Origin', `https://${target.host}`)
    headers.set('Referer', `https://${target.host}/`)

    let body: BodyInit | undefined = undefined
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      body = await req.text()
    }

    const mlRes = await fetch(targetUrl, {
      method: req.method,
      headers,
      body,
      redirect: 'manual',
    })

    // Ler body
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
      if (key.toLowerCase() === 'location') {
        responseHeaders.set('Location', rewrite(value, baseOrigin))
        continue
      }
      // Drop CSP e X-Frame pra proxy não ser bloqueado pelo nosso middleware
      if (key.toLowerCase() === 'content-security-policy') continue
      if (key.toLowerCase() === 'x-frame-options') continue
      responseHeaders.set(key, value)
    }
    responseHeaders.set('Cache-Control', 'no-store, no-cache, must-revalidate')

    // Reescreve HTML body
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

    console.log(`[proxy-ml] ${req.method} ${url.pathname} -> ${mlRes.status}`)

    if (mlRes.status >= 300 && mlRes.status < 400) {
      return new NextResponse(null, { status: mlRes.status, headers: responseHeaders })
    }

    return new NextResponse(bodyText, { status: mlRes.status, headers: responseHeaders })
  } catch (e: any) {
    console.error(`[proxy-ml] ERROR:`, e.message)
    return NextResponse.json({ ok: false, error: e.message?.substring(0, 200) }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  return forwardRequest(req)
}
export async function POST(req: NextRequest) {
  return forwardRequest(req)
}