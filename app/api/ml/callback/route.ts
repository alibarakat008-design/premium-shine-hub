/**
 * =====================================================
 * CALLBACK OAUTH MERCADO LIVRE
 * =====================================================
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const ML_TOKEN_URL = 'https://api.mercadolibre.com/oauth/token'
const ML_API_BASE = 'https://api.mercadolibre.com'
const ML_CLIENT_ID = process.env.ML_CLIENT_ID!
const ML_CLIENT_SECRET = process.env.ML_CLIENT_SECRET!
const ML_REDIRECT_URI = process.env.ML_REDIRECT_URI || 'http://localhost:3000/api/ml/callback'

export async function GET(request: NextRequest) {

  console.log('[ML Callback] Started')
  try {
    console.log('[ML Callback] Using shared prisma client:', typeof prisma)
    console.log('[ML Callback] Prisma keys:', Object.keys(prisma))
  } catch (e: any) {
    console.error('[ML Callback] Failed to create Prisma:', e)
    return NextResponse.json({ error: 'Erro ao conectar banco', details: e.message }, { status: 500 })
  }
  
  try {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const error = searchParams.get('error')

    console.log('[ML Callback] Params - code:', !!code, 'state:', !!state, 'error:', error)

    if (error) {
      await prisma.$disconnect()
      return NextResponse.redirect(
        new URL(`/admin/mercado-livre?error=${error}`, request.url)
      )
    }

    if (!code || !state) {
      await prisma.$disconnect()
      return NextResponse.json(
        { error: 'Código ou state ausente' },
        { status: 400 }
      )
    }

    // 1) Trocar code por tokens
    const tokenRes = await fetch(ML_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: ML_CLIENT_ID,
        client_secret: ML_CLIENT_SECRET,
        code,
        redirect_uri: ML_REDIRECT_URI,
      }),
    })

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text()
      console.error('[ML OAuth] Erro ao trocar code:', errBody)
      await prisma.$disconnect()
      return NextResponse.json(
        { error: 'Falha ao obter token do ML' },
        { status: 500 }
      )
    }

    const token: any = await tokenRes.json()
    console.log('[ML Callback] Token received:', !!token.access_token)

    // 2) Buscar dados do usuário ML
    const userRes = await fetch(`${ML_API_BASE}/users/me`, {
      headers: { Authorization: `Bearer ${token.access_token}` },
    })
    const mlUser = await userRes.json()
    console.log('[ML Callback] ML User:', mlUser)

    // 3) Calcular expiração
    const expiresAt = new Date(Date.now() + token.expires_in * 1000)

    // 4) Salvar/atualizar conta no banco
    console.log('[ML Callback] Prisma type:', typeof prisma)
    console.log('[ML Callback] Marketplace accounts findFirst...')
    
    const companyId = await getDefaultCompanyId()
    
    let account = await prisma.marketplace_accounts.findFirst({
      where: {
        plataforma: 'mercado_livre',
        account_id: String(mlUser.id),
      },
    })
    
    if (!account) {
      account = await prisma.marketplace_accounts.create({
        data: {
          plataforma: 'mercado_livre',
          account_id: String(mlUser.id),
          nickname: mlUser.nickname,
          company_id: companyId || undefined,
          access_token: token.access_token,
          refresh_token: token.refresh_token,
          token_expira_em: expiresAt,
          ativa: true,
        },
      })
    } else {
      account = await prisma.marketplace_accounts.update({
        where: { id: account.id },
        data: {
          nickname: mlUser.nickname,
          access_token: token.access_token,
          refresh_token: token.refresh_token,
          token_expira_em: expiresAt,
        },
      })
    }

    await prisma.audit_log.create({
      data: {
        user_id: state,
        acao: 'conectar_ml',
        tabela: 'marketplace_accounts',
        registro_id: account.id,
        dados_novos: { nickname: mlUser.nickname, ml_user_id: mlUser.id },
      },
    })

    await prisma.$disconnect()
    return NextResponse.redirect(
      new URL(
        `/admin/mercado-livre?success=true&nickname=${encodeURIComponent(mlUser.nickname)}`,
        request.url
      )
    )
  } catch (err: any) {
    console.error('[ML Callback] Error:', err)
    console.error('[ML Callback] Error type:', typeof err)
    console.error('[ML Callback] Prisma available:', !!prisma)
    await prisma.$disconnect().catch(() => {})
    return NextResponse.json(
      { error: 'Erro interno', details: err.message, stack: err.stack },
      { status: 500 }
    )
  }
}

async function getDefaultCompanyId(): Promise<string> {
  try {
    const company = await prisma.companies.findFirst({
      where: { ativa: true },
      orderBy: { created_at: 'asc' },
    })
    return company?.id || ''
  } catch (e) {
    console.error('[ML Callback] getDefaultCompanyId error:', e)
    return ''
  }
}
