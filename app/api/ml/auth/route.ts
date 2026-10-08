/**
 * =====================================================
 * INTEGRAÇÃO MERCADO LIVRE — OAuth + Sincronização
 * Premium Shine Hub
 * =====================================================
 *
 * Suporta múltiplas contas (você + amigos)
 * Stack: OAuth 2.0 oficial do ML + Prisma + node-cron
 *
 * Endpoints:
 *   GET  /api/ml/auth           — Inicia OAuth (redireciona pro ML)
 *   GET  /api/ml/callback       — Recebe o código e troca por token
 *   GET  /api/ml/accounts       — Lista contas conectadas
 *   DELETE /api/ml/accounts/:id — Desconecta uma conta
 *   POST /api/ml/sync/products  — Sincroniza produtos ML → sistema
 *   POST /api/ml/sync/orders    — Sincroniza pedidos ML → sistema
 *   POST /api/ml/sync/stock     — Atualiza estoque do sistema → ML
 *   POST /api/ml/webhook        — Recebe notificações do ML (orders, items)
 * =====================================================
 */

// =====================================================
// CONFIGURAÇÃO
// =====================================================
const ML_AUTH_URL = 'https://auth.mercadolivre.com.br/authorization'
const ML_TOKEN_URL = 'https://api.mercadolibre.com/oauth/token'
const ML_API_BASE = 'https://api.mercadolibre.com'

const ML_CLIENT_ID = process.env.ML_CLIENT_ID!
const ML_CLIENT_SECRET = process.env.ML_CLIENT_SECRET!
const ML_REDIRECT_URI = process.env.ML_REDIRECT_URI || 'http://localhost:3000/api/ml/callback'

interface MLTokenResponse {
  access_token: string
  token_type: string
  expires_in: number // segundos
  scope: string
  user_id: number
  refresh_token: string
}

interface MLUser {
  id: number
  nickname: string
  email: string
  first_name: string
  last_name: string
}

// =====================================================
// 1) INICIAR OAUTH
// =====================================================
// app/api/ml/auth/route.ts

import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {

  const { searchParams } = new URL(request.url)
  const state = searchParams.get('state') // identifica qual user está logando

  if (!state) {
    return NextResponse.json(
      { error: 'Parâmetro state obrigatório' },
      { status: 400 }
    )
  }

  // URL de autorização do ML
  const authUrl = new URL(ML_AUTH_URL)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('client_id', ML_CLIENT_ID)
  authUrl.searchParams.set('redirect_uri', ML_REDIRECT_URI)
  authUrl.searchParams.set('state', state)
  // Scopes: ler e atualizar itens, ler pedidos, ler usuários
  authUrl.searchParams.set(
    'scope',
    'offline_access read write items.read items.write orders.read orders.refund shipping.read shipping.write'
  )

  // Redireciona pro ML
  return NextResponse.redirect(authUrl.toString())
}
