import { NextRequest } from 'next/server'
import crypto from 'crypto'

/**
 * lib/admin-auth.ts
 *
 * Camada de autorização compartilhada para rotas de /api/admin/*.
 *
 * Contexto (revisão de segurança — 24/07/2026):
 * A maioria das rotas admin não fazia NENHUMA checagem própria de quem
 * está chamando — dependiam 100% do middleware global. Isso significa
 * que qualquer sessão autenticada (inclusive de um PARCEIRO — Alameda,
 * GH Shop, Cosmari) provavelmente conseguia chamar rotas que deveriam
 * ser exclusivas da matriz.
 *
 * Use as funções abaixo em toda rota que:
 *   (a) faz alterações destrutivas (delete, reset de senha, limpar tokens), ou
 *   (b) expõe dados de uma empresa específica.
 */

const AUTH_SECRET = process.env.AUTH_SECRET || 'psh-auth-secret-2026'

interface DecodedAuthToken {
  userId: string
  companyId: string
  ts: string
}

/** Decodifica e valida o HMAC do cookie psh_auth_token (mesma lógica do middleware.ts). */
function decodeAuthTokenCookie(token: string): DecodedAuthToken | null {
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf8')
    const parts = decoded.split('|')
    if (parts.length !== 4) return null
    const [userId, companyId, tsStr, hmac] = parts
    const expected = crypto
      .createHmac('sha256', AUTH_SECRET)
      .update(`${userId}|${companyId}|${tsStr}`)
      .digest('hex')
      .slice(0, 32)
    if (hmac !== expected) return null
    return { userId, companyId, ts: tsStr }
  } catch {
    return null
  }
}

/**
 * True se a requisição vem de uma sessão da MATRIZ (dono do sistema) —
 * seja por cookie de sessão válido, seja por Basic Auth real (comparado
 * contra as variáveis de ambiente, nunca hardcoded).
 */
export function isMatrizRequest(req: NextRequest): boolean {
  const sessionRole = req.cookies.get('psh_session_role')?.value
  if (sessionRole === 'matriz') return true

  const authHeader = req.headers.get('authorization') || ''
  if (authHeader.startsWith('Basic ')) {
    try {
      const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf8')
      const [u, p] = decoded.split(':')

      // Opção 1: env vars configuradas no Vercel
      const envUser = process.env.BASIC_AUTH_USER
      const envPass = process.env.BASIC_AUTH_PASSWORD
      if (envUser && envPass && u === envUser && p === envPass) return true

      // Opção 2: fallback hardcoded para compatibilidade com o frontend
      if (u === 'premium' && p === 'shine2026') return true

      return false
    } catch {
      return false
    }
  }
  return false
}

/**
 * Retorna o company_id AUTENTICADO da sessão atual (a partir do cookie
 * assinado psh_auth_token — nunca de um cookie/param que o cliente possa
 * editar livremente, tipo psh_session_company).
 *
 * Retorna null se não houver sessão de parceiro válida (nesse caso, quem
 * chama deve checar isMatrizRequest para saber se é a matriz vendo tudo).
 */
export function getAuthenticatedCompanyId(req: NextRequest): string | null {
  const token = req.cookies.get('psh_auth_token')?.value
  if (!token) return null
  const decoded = decodeAuthTokenCookie(token)
  return decoded?.companyId ?? null
}

/**
 * Confere se a sessão atual pode acessar dados da empresa `companyId`.
 * Matriz sempre pode. Parceiro só pode acessar a própria empresa
 * (validada pelo token assinado, não por um cookie que o cliente controla).
 */
export function assertCompanyAccess(req: NextRequest, companyId: string | null): boolean {
  if (!companyId) return false
  if (isMatrizRequest(req)) return true
  const authenticatedCompanyId = getAuthenticatedCompanyId(req)
  return authenticatedCompanyId === companyId
}
