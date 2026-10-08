import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * Testa se o refresh_token da LIURAESSENCE está válido.
 * Se sim, ML aceita as credenciais (significa que o problema é só no OAuth UI)
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Basic ${Buffer.from('premium:shine2026').toString('base64')}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // LIURAESSENCE
    const matrizRes: any[] = await prisma.$queryRawUnsafe(
      `SELECT id, access_token_ml, refresh_token_ml, ml_expires_at, ml_user_id FROM companies WHERE cnpj = '11.222.333/0001-81'`,
    )

    if (matrizRes.length === 0) return NextResponse.json({ ok: false, error: 'LIURAESSENCE não encontrada' })

    const matriz = matrizRes[0]

    // Tenta refresh
    const appId = process.env.ML_CLIENT_ID
    const secret = process.env.ML_CLIENT_SECRET
    if (!appId || !secret) {
      return NextResponse.json({ ok: false, error: 'ML_CLIENT_ID ou SECRET faltando' })
    }

    let result: any = {
      has_refresh_token: !!matriz.refresh_token_ml,
      refresh_token_preview: matriz.refresh_token_ml ? matriz.refresh_token_ml.substring(0, 4) + '...' : null,
    }

    // Testa refresh_token (se houver)
    if (matriz.refresh_token_ml) {
      const r = await fetch('https://api.mercadolibre.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: appId,
          client_secret: secret,
          refresh_token: matriz.refresh_token_ml,
        }),
      })
      result.refresh_status = r.status
      result.refresh_body = (await r.text()).substring(0, 400)
    }

    // Tenta access_token atual
    if (matriz.access_token_ml) {
      const r2 = await fetch('https://api.mercadolibre.com/users/me', {
        headers: { Authorization: `Bearer ${matriz.access_token_ml}` },
      })
      result.me_status = r2.status
      if (r2.ok) {
        result.me = await r2.json()
      } else {
        result.me_body = (await r2.text()).substring(0, 300)
      }
    }

    return NextResponse.json({ ok: true, result })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}