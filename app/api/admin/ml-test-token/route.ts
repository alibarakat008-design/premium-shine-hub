import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getMLToken } from '@/lib/ml-auth-multi'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || ''
    if (!authHeader.startsWith('Basic ')) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }

    const acc = await prisma.marketplace_accounts.findFirst({
      where: { nickname: 'LIURAESSENCE' },
    })
    if (!acc) return NextResponse.json({ ok: false, error: 'Conta não encontrada' }, { status: 404 })

    const tokenRes = await getMLToken(acc.company_id || '')
    const token = tokenRes?.token
    if (!token) return NextResponse.json({ ok: false, error: 'Sem token' }, { status: 401 })

    // 1) Testa /users/me
    const meRes = await fetch('https://api.mercadolibre.com/users/me', {
      headers: { Authorization: `Bearer ${token}` },
    })
    const meStatus = meRes.status
    const meText = await meRes.text()
    let meJson = null
    try { meJson = JSON.parse(meText) } catch {}

    // 2) Testa /orders/search simples
    const searchRes = await fetch(`https://api.mercadolibre.com/orders/search?seller=${acc.account_id}&order.status=paid&limit=5&offset=0`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const searchStatus = searchRes.status
    const searchJson = await searchRes.json()

    return NextResponse.json({
      ok: true,
      account: {
        id: acc.id,
        nickname: acc.nickname,
        account_id: acc.account_id,
        token_expira_em: acc.token_expira_em,
      },
      token_source: tokenRes?.source,
      users_me: { status: meStatus, body: meJson || meText.substring(0, 200) },
      search: {
        status: searchStatus,
        total: searchJson.paging?.total,
        results_count: (searchJson.results || []).length,
        first_id: searchJson.results?.[0]?.id,
        first_date: searchJson.results?.[0]?.date_created,
      },
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message, stack: e.stack }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}