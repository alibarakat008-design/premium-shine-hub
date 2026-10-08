// Helper pra fetch com Basic Auth automático
// Resolve 2 problemas:
// 1. Quando o app está atrás de Basic Auth (Vercel middleware), garante que o header Authorization vai
// 2. Quando a URL atual tem credenciais embutidas (caso raro), usa URL absoluta sem credenciais

const CREDENTIALS = 'premium:shine2026'
const BASIC_AUTH = 'Basic ' + btoa(CREDENTIALS)

function resolveUrl(url: string): string {
  // Se a URL é absoluta (começa com http), retorna como está
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url
  }
  // Senão, monta URL absoluta a partir da origin atual
  if (typeof window !== 'undefined') {
    return window.location.origin + (url.startsWith('/') ? url : '/' + url)
  }
  return url
}

let lastWarnAt = 0

export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const separator = url.includes('?') ? '&' : '?'
  const urlWithTs = `${url}${separator}_t=${Date.now()}`
  const finalUrl = resolveUrl(urlWithTs)

  const headers = new Headers(options.headers)
  if (!headers.has('Authorization')) {
    headers.set('Authorization', BASIC_AUTH)
  }
  if (!headers.has('Cache-Control')) {
    headers.set('Cache-Control', 'no-cache, no-store, must-revalidate')
    headers.set('Pragma', 'no-cache')
  }

  try {
    const res = await fetch(finalUrl, {
      ...options,
      headers,
    })
    return res
  } catch (err: any) {
    // Mensagem amigável no console (1x a cada 30s pra não poluir)
    const now = Date.now()
    if (now - lastWarnAt > 30000) {
      console.warn('[apiFetch] Erro de rede — verifique conexão ou auth:', err.message, 'URL:', finalUrl)
      lastWarnAt = now
    }
    throw err
  }
}

export { BASIC_AUTH }