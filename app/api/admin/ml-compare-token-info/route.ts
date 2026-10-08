import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getMLToken } from '@/lib/ml-auth-multi'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || ''
    if (!authHeader.startsWith('Basic ')) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

    const acc = await prisma.marketplace_accounts.findFirst({ where: { nickname: 'LIURAESSENCE' } })
    if (!acc) return NextResponse.json({ ok: false, error: 'no acc' }, { status: 404 })

    // 1) Testa token da CONTA (acc.access_token) — esse é o que compare usa
    let accTokenTest: any = null
    if (acc.access_token) {
      const r = await fetch(`https://api.mercadolibre.com/orders/search?seller=${acc.account_id}&order.status=paid&limit=5&offset=0`, {
        headers: { Authorization: `Bearer ${acc.access_token}` },
      })
      const j = await r.json()
      accTokenTest = { status: r.status, total: j.paging?.total, error: j.error || j.message }
    }

    // 2) Testa token da COMPANY (companies.access_token_ml) — esse é o que ml-test-token usa
    let compTokenTest: any = null
    const tokenRes = await getMLToken(acc.company_id || '')
    if (tokenRes?.token) {
      const r = await fetch(`https://api.mercadolibre.com/orders/search?seller=${acc.account_id}&order.status=paid&limit=5&offset=0`, {
        headers: { Authorization: `Bearer ${tokenRes.token}` },
      })
      const j = await r.json()
      compTokenTest = { status: r.status, total: j.paging?.total, error: j.error || j.message, source: tokenRes.source, expires: tokenRes.expires_at }
    }

    return NextResponse.json({
      ok: true,
      account: {
        id: acc.id,
        nickname: acc.nickname,
        account_id: acc.account_id,
        company_id: acc.company_id,
        access_token_present: !!acc.access_token,
        token_expira_em: acc.token_expira_em,
      },
      account_token_test: accTokenTest,
      company_token_test: compTokenTest,
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}