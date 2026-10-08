/**
 * SHOPIE PLUGIN OAUTH: fluxo de autorização Shopee
 *
 * Documentação: https://open.shopee.com/documents?module=87&type=2
 *
 * GET /api/plugins/shopee/oauth/start?partner_id=X&redirect=/admin
 *    → Redireciona pra https://partner.shopeemobile.com/api/v1/shop/auth_partner
 *
 * GET /api/plugins/shopee/oauth/callback?code=X&shop_id=X
 *    → Troca code por access_token
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { SHOPEE_AUTH_URL, SHOPEE_TOKEN_URL } from '@/lib/plugins/shopee'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

function buildAuthUrl(partnerId: number, redirectUrl: string, token: string) {
  const params = new URLSearchParams({
    partner_id: String(partnerId),
    redirect: redirectUrl,
    token,
  })
  return `${SHOPEE_AUTH_URL}?${params.toString()}`
}

function sign(partnerKey: string, partnerId: number, path: string, timestamp: number) {
  const baseStr = `${partnerId}${path}${timestamp}`
  return crypto.createHmac('sha256', partnerKey).update(baseStr).digest('hex')
}

export async function GET(req: NextRequest) {
  const action = req.nextUrl.searchParams.get('action') || 'start'

  if (action === 'start') {
    const partnerId = Number(req.nextUrl.searchParams.get('partner_id') || 0)
    const partnerKey = req.nextUrl.searchParams.get('partner_key') || ''
    const redirect = req.nextUrl.searchParams.get('redirect') || '/admin/integracoes'
    const companyId = req.nextUrl.searchParams.get('company_id') || ''

    if (!partnerId || !partnerKey) {
      return NextResponse.json({
        ok: false,
        error: 'Faltam partner_id ou partner_key',
        instrucoes: [
          '1. Crie um app em https://open.shopee.com (tipo "Custom App")',
          '2. Em "App Information" copie partner_id e partner_key',
          '3. Em "Callback URL" coloque: https://premium-shine-hub.vercel.app/api/plugins/shopee/oauth/callback',
          '4. Chame: /api/plugins/shopee/oauth?action=start&partner_id=X&partner_key=Y&redirect=/admin&company_id=Z',
        ],
      })
    }

    // Token de state (validar no callback)
    const state = `${companyId}:${Date.now()}:${crypto.randomBytes(8).toString('hex')}`
    const redirectUrl = `https://premium-shine-hub.vercel.app/api/plugins/shopee/oauth?action=callback&state=${state}`

    const authUrl = buildAuthUrl(partnerId, redirectUrl, state)

    return NextResponse.redirect(authUrl)
  }

  if (action === 'callback') {
    const code = req.nextUrl.searchParams.get('code') || ''
    const shopId = Number(req.nextUrl.searchParams.get('shop_id') || 0)
    const state = req.nextUrl.searchParams.get('state') || ''

    if (!code || !shopId) {
      return NextResponse.json({ ok: false, error: 'Faltam code ou shop_id no callback' }, { status: 400 })
    }

    const [companyId] = state.split(':')

    // Carrega config pra pegar partner_id e partner_key
    const cfg: any[] = await prisma.$queryRawUnsafe(`
      SELECT config FROM plugin_configs
      WHERE plugin_id = 'shopee' AND company_id = $1::uuid
    `, companyId)

    if (cfg.length === 0) {
      return NextResponse.json({ ok: false, error: 'Plugin não instalado' }, { status: 400 })
    }

    const config = cfg[0].config
    const timestamp = Math.floor(Date.now() / 1000)
    const signHmac = sign(config.partner_key, config.partner_id, '/api/v1/auth/token/get', timestamp)

    // Troca code por access_token
    const tokenRes = await fetch(SHOPEE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        partner_id: config.partner_id,
        shop_id: shopId,
        timestamp,
        sign: signHmac,
      }),
    })
    const tokenData = await tokenRes.json()

    if (!tokenData.access_token) {
      return NextResponse.json({ ok: false, error: 'Falha ao trocar code por access_token', debug: tokenData })
    }

    // Salva access_token
    await prisma.$queryRawUnsafe(`
      UPDATE plugin_configs
      SET config = config || $1::jsonb, updated_at = NOW()
      WHERE plugin_id = 'shopee' AND company_id = $2::uuid
    `, JSON.stringify({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      shop_id: shopId,
      expires_at: tokenData.expire_in ? new Date(Date.now() + tokenData.expire_in * 1000).toISOString() : null,
    }), companyId)

    return NextResponse.redirect(`https://premium-shine-hub.vercel.app/admin/integracoes?shopee=ok`)
  }

  return NextResponse.json({ ok: false, error: 'Ação inválida' }, { status: 400 })
}
