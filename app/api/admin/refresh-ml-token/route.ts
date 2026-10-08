import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const BASIC = 'Basic ' + Buffer.from('premium:shine2026').toString('base64')

const ML_CLIENT_ID = process.env.ML_CLIENT_ID || ''
const ML_CLIENT_SECRET = process.env.ML_CLIENT_SECRET || ''
const ML_REFRESH_URL = 'https://api.mercadolibre.com/oauth/token'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== BASIC) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  const companyId = req.nextUrl.searchParams.get('company_id') || 'e2633570-74da-4b14-9ca1-ba7b0670e612'
  try {
    // Pega conta ML
    const acc: any[] = await prisma.$queryRawUnsafe(`
      SELECT id, refresh_token, token_expira_em
      FROM marketplace_accounts
      WHERE company_id = $1::uuid AND plataforma = 'mercado_livre'
      LIMIT 1
    `, companyId)
    if (acc.length === 0 || !acc[0].refresh_token) {
      return NextResponse.json({ ok: false, error: 'Sem refresh_token' })
    }
    const accountId = acc[0].id
    const refresh = acc[0].refresh_token

    // Renova
    const r = await fetch(ML_REFRESH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: ML_CLIENT_ID,
        client_secret: ML_CLIENT_SECRET,
        refresh_token: refresh,
      }).toString(),
    })
    const j = await r.json()
    if (!j.access_token) {
      return NextResponse.json({ ok: false, error: 'Falha ao renovar', debug: j })
    }

    // Salva
    await prisma.$queryRawUnsafe(`
      UPDATE marketplace_accounts
      SET access_token = $1, token_expira_em = NOW() + INTERVAL '6 hours', updated_at = NOW()
      WHERE id = $2::uuid
    `, j.access_token, accountId)

    // Testa
    const r2 = await fetch(`https://api.mercadolibre.com/orders/search?seller=674217463&limit=1`, {
      headers: { Authorization: `Bearer ${j.access_token}` }
    })
    const j2 = await r2.json()

    return NextResponse.json({
      ok: true,
      access_token_novo: j.access_token.substring(0, 30) + '...',
      expira_em: j.expires_in,
      test_paging: j2.paging,
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message })
  } finally {
    await prisma.$disconnect()
  }
}
