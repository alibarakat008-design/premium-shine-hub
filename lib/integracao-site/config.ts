/**
 * =====================================================
 * VINCULAÇÃO DO SITE EXTERNO (premiumshine.com.br)
 * Premium Shine Hub
 * =====================================================
 *
 * 3 formas de integrar site externo com o sistema:
 *
 * 1) **API REST pública** — site faz fetch() direto
 * 2) **Widget JavaScript embed** — cola um <script> no site
 * 3) **Webhook reverso** — sistema envia eventos pro site
 *
 * Este arquivo configura a vinculação via API + Widget.
 * =====================================================
 */

// =====================================================
// CONFIGURAÇÃO DE DOMÍNIO PERMITIDO (CORS)
// =====================================================

/**
 * Adicione no middleware ou em um arquivo de config:
 *
 * Domínios permitidos pra fazer requisições à API:
 */
export const ALLOWED_ORIGINS = [
  'https://premiumshine.com.br',
  'https://www.premiumshine.com.br',
  'https://loja.premiumshine.com.br', // subdomínio se tiver
  'https://premiumshine.com', // sem .br
  // Adicione outros domínios que você usa
]

/**
 * Configuração do CORS:
 * =====================================================
 * next.config.js
 * =====================================================
 *
 * const ALLOWED_ORIGINS = [
 *   'https://premiumshine.com.br',
 *   'https://www.premiumshine.com.br',
 * ]
 *
 * module.exports = {
 *   async headers() {
 *     return [
 *       {
 *         source: '/api/:path*',
 *         headers: [
 *           { key: 'Access-Control-Allow-Origin', value: ALLOWED_ORIGINS.join(', ') },
 *           { key: 'Access-Control-Allow-Methods', value: 'GET,POST,PUT,DELETE,OPTIONS' },
 *           { key: 'Access-Control-Allow-Headers', value: 'Content-Type,Authorization,X-API-Key' },
 *           { key: 'Access-Control-Allow-Credentials', value: 'true' },
 *         ],
 *       },
 *     ]
 *   },
 * }
 * =====================================================
 */

// =====================================================
// MIDDLEWARE DE CORS AUTOMÁTICO
// =====================================================
// middleware-cors.ts (adicionar no projeto)

/*
import { NextRequest, NextResponse } from 'next/server'

export function corsMiddleware(request: NextRequest) {
  const origin = request.headers.get('origin')

  // Lista de origens permitidas
  const allowedOrigins = [
    'https://premiumshine.com.br',
    'https://www.premiumshine.com.br',
    'https://loja.premiumshine.com.br',
  ]

  // Se origem não tá na lista, bloqueia
  if (origin && !allowedOrigins.includes(origin)) {
    return new NextResponse('Origem não permitida', { status: 403 })
  }

  // Resposta OK com CORS headers
  const response = NextResponse.next()

  if (origin) {
    response.headers.set('Access-Control-Allow-Origin', origin)
    response.headers.set('Access-Control-Allow-Credentials', 'true')
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key')
  }

  // Responder preflight (OPTIONS)
  if (request.method === 'OPTIONS') {
    return new NextResponse(null, { status: 200, headers: response.headers })
  }

  return response
}
*/

// =====================================================
// API KEY PARA O SITE EXTERNO
// =====================================================

/**
 * O site premiumshine.com.br precisa de uma API Key
 * pra autenticar nas requisições.
 *
 * Vá em /admin/configuracoes/api-keys e gere uma:
 *   - Nome: "Site Premium Shine"
 *   - Domínio: "premiumshine.com.br"
 *   - Escopo: read:products, read:categories, write:orders
 *   - Status: ativo
 *
 * O sistema retorna uma chave tipo: "psh_live_abc123def456..."
 * Cole no .env do site:
 *
 * NEXT_PUBLIC_API_URL=https://api.premiumshine.com.br
 * PREMIUMSHINE_API_KEY=psh_live_abc123def456...
 */

// =====================================================
// VALIDAÇÃO DE API KEY
// =====================================================
// middleware-api-key.ts

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function validateApiKey(request: Request): Promise<{ valid: boolean; accountId?: string; error?: string }> {
  const apiKey = request.headers.get('x-api-key')

  if (!apiKey) {
    return { valid: false, error: 'API Key ausente' }
  }

  // Buscar API key no banco
  const key = await prisma.api_keys.findUnique({
    where: { key: apiKey },
    include: { companies: true },
  })

  if (!key || !key.ativa) {
    return { valid: false, error: 'API Key inválida ou inativa' }
  }

  // Verificar expiração
  if (key.expira_em && new Date(key.expira_em) < new Date()) {
    return { valid: false, error: 'API Key expirada' }
  }

  // Verificar origem (CORS)
  const origin = request.headers.get('origin')
  if (key.allowed_origins && key.allowed_origins.length > 0 && origin) {
    if (!key.allowed_origins.includes(origin)) {
      return { valid: false, error: 'Origem não autorizada' }
    }
  }

  // Atualizar último uso
  await prisma.api_keys.update({
    where: { id: key.id },
    data: { ultimo_uso: new Date() },
  })

  return { valid: true, accountId: key.company_id }
}
