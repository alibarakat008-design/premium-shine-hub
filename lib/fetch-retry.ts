/**
 * =====================================================
 * Fetch com Retry — lida com EPROTO e erros transitórios
 * =====================================================
 * Faz retry automático em erros de rede como:
 * - EPROTO (TLS handshake failure)
 * - ECONNRESET
 * - ETIMEDOUT
 * - ENOTFOUND
 * =====================================================
 */

const RETRYABLE_PATTERNS = [
  'EPROTO',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'ENETUNREACH',
  'EAI_AGAIN',
  'socket hang up',
  'getaddrinfo',
]

function isRetryableError(err: any): boolean {
  if (!err) return false
  const msg = String(err.message || err).toUpperCase()
  return RETRYABLE_PATTERNS.some(p => msg.includes(p.toUpperCase()))
}

/**
 * Fetch com retry automático
 * @param url URL para fetch
 * @param options Opções do fetch
 * @param retries Número de tentativas (default: 3)
 * @param delayMs Delay entre tentativas em ms (default: 1000)
 */
export async function fetchWithRetry<T = any>(
  url: string,
  options: RequestInit = {},
  retries = 3,
  delayMs = 1500,
): Promise<T> {
  let lastError: any

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        ...options,
        // Timeout via AbortController
        signal: options.signal || (() => {
          const ctrl = new AbortController()
          setTimeout(() => ctrl.abort(), 30000)
          return ctrl.signal
        })(),
      } as RequestInit)

      // Se a resposta veio (até 5xx), retorna — retry só pra network errors
      if (res.ok || res.status >= 400) {
        const text = await res.text()
        let json: T
        try {
          json = JSON.parse(text) as T
        } catch {
          return text as any as T
        }
        return json
      }

      // 5xx — retry
      if (res.status >= 500 && attempt < retries) {
        lastError = new Error(`HTTP ${res.status} na tentativa ${attempt}`)
        await new Promise(r => setTimeout(r, delayMs * attempt))
        continue
      }

      const text = await res.text()
      try {
        return JSON.parse(text) as T
      } catch {
        return text as any as T
      }
    } catch (err: any) {
      lastError = err

      if (isRetryableError(err)) {
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, delayMs * attempt))
          continue
        }
      }

      // Erro não-retryable
      throw err
    }
  }

  throw lastError
}
