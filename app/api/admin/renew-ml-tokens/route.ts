import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * Renova o access_token usando o refresh_token (SEM precisar de browser!)
 *
 * Tenta os DOIS sistemas:
 *   1. companies.access_token_ml (novo)
 *   2. marketplace_accounts.access_token (legado)
 *
 * Se conseguir renovar, salva no banco.
 */
export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Basic ${Buffer.from('premium:shine2026').toString('base64')}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const appId = process.env.ML_CLIENT_ID
  const secret = process.env.ML_CLIENT_SECRET
  if (!appId || !secret) {
    return NextResponse.json({ ok: false, error: 'ML_CLIENT_ID ou ML_CLIENT_SECRET faltando' }, { status: 500 })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const companyId = body.company_id || 'e2633570-74da-4b14-9ca1-ba7b0670e612' // LIURAESSENCE default

    // 1. Tenta via companies (sistema novo)
    const compRes: any[] = await prisma.$queryRawUnsafe(
      `SELECT id, refresh_token_ml FROM companies WHERE id = $1::uuid AND refresh_token_ml IS NOT NULL`,
      companyId,
    )
    let refreshToken: string | null = null
    let viaSistema: 'companies' | 'marketplace_accounts' = 'marketplace_accounts'
    let companyInternalId: string | null = null

    if (compRes.length > 0 && compRes[0].refresh_token_ml) {
      refreshToken = compRes[0].refresh_token_ml
      companyInternalId = compRes[0].id
      viaSistema = 'companies'
    }

    // 2. Fallback: marketplace_accounts (legado)
    if (!refreshToken) {
      const maRes: any[] = await prisma.$queryRawUnsafe(
        `SELECT id, refresh_token, company_id FROM marketplace_accounts
         WHERE plataforma = 'mercado_livre' AND refresh_token IS NOT NULL
         ORDER BY token_expira_em DESC NULLS LAST
         LIMIT 1`
      )
      if (maRes.length > 0) {
        refreshToken = maRes[0].refresh_token
        companyInternalId = maRes[0].company_id
        viaSistema = 'marketplace_accounts'
      }
    }

    if (!refreshToken) {
      return NextResponse.json({ ok: false, error: 'Nenhum refresh_token disponível' }, { status: 404 })
    }

    // 2. Tenta refresh
    const r = await fetch('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: appId,
        client_secret: secret,
        refresh_token: refreshToken,
      }),
    })

    const rJson = await r.json()

    if (!r.ok) {
      return NextResponse.json({
        ok: false,
        error: `ML recusou refresh: ${r.status}`,
        ml_response: rJson,
      }, { status: 400 })
    }

    // 3. Salva em companies (sistema novo)
    const expiresAt = new Date(Date.now() + (rJson.expires_in || 21600) * 1000)
    await prisma.$queryRawUnsafe(`
      UPDATE companies SET
        access_token_ml = $2,
        refresh_token_ml = $3,
        ml_expires_at = $4,
        ml_user_id = $5,
        updated_at = NOW()
      WHERE id = $1::uuid
    `, companyInternalId, rJson.access_token, rJson.refresh_token, expiresAt, rJson.user_id)

    // 4. Salva TAMBÉM em marketplace_accounts (legado, pra manter funcionando)
    await prisma.$queryRawUnsafe(`
      UPDATE marketplace_accounts SET
        access_token = $1,
        refresh_token = $2,
        token_expira_em = $3,
        updated_at = NOW()
      WHERE company_id = $4::uuid AND plataforma = 'mercado_livre'
    `, rJson.access_token, rJson.refresh_token, expiresAt, companyInternalId)

    return NextResponse.json({
      ok: true,
      message: '✅ Tokens renovados com sucesso!',
      via: viaSistema,
      expires_at: expiresAt,
      ml_user_id: rJson.user_id,
      new_refresh_set: !!rJson.refresh_token,
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}