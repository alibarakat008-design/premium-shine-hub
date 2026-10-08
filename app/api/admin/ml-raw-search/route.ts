import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getMLToken } from '@/lib/ml-auth-multi'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || ''
    if (!authHeader.startsWith('Basic ')) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    const { searchParams } = new URL(req.url)
    const from = searchParams.get('from') || '2026-06-08'
    const to = searchParams.get('to') || '2026-07-08'

    const acc = await prisma.marketplace_accounts.findFirst({ where: { nickname: 'LIURAESSENCE' } })
    if (!acc) return NextResponse.json({ ok: false, error: 'no acc' }, { status: 404 })
    const tokenRes = await getMLToken(acc.company_id || '')
    const token = tokenRes?.token
    if (!token) return NextResponse.json({ ok: false, error: 'no token' }, { status: 401 })

    // 1) Query SEM filter de status (todos)
    const fromISO = `${from}T00:00:00.000-04:00`
    const toISO = `${to}T23:59:59.999-04:00`
    const urlAll = `https://api.mercadolibre.com/orders/search?seller=${acc.account_id}&order.date_created.from=${fromISO}&order.date_created.to=${toISO}&limit=10&offset=0&sort=date_desc`
    const rAll = await fetch(urlAll, { headers: { Authorization: `Bearer ${token}` } })
    const jAll = await rAll.json()

    // 2) Query COM filter de status (paid só)
    const urlPaid = `https://api.mercadolibre.com/orders/search?seller=${acc.account_id}&order.status=paid&order.date_created.from=${fromISO}&order.date_created.to=${toISO}&limit=10&offset=0&sort=date_desc`
    const rPaid = await fetch(urlPaid, { headers: { Authorization: `Bearer ${token}` } })
    const jPaid = await rPaid.json()

    // 3) Query COM múltiplos status (como o compare faz)
    const statuses = ['paid', 'confirmed', 'delivered', 'shipped', 'cancelled', 'pending', 'in_dispute', 'mediation']
    const sf = statuses.map(s => `order.status=${s}`).join('&')
    const urlMulti = `https://api.mercadolibre.com/orders/search?seller=${acc.account_id}&${sf}&order.date_created.from=${fromISO}&order.date_created.to=${toISO}&limit=10&offset=0&sort=date_desc`
    const rMulti = await fetch(urlMulti, { headers: { Authorization: `Bearer ${token}` } })
    const jMulti = await rMulti.json()

    return NextResponse.json({
      ok: true,
      period: { from, to, fromISO, toISO },
      token_source: tokenRes.source,
      query_no_status: { total: jAll.paging?.total, results: jAll.results?.length, first_3: (jAll.results || []).slice(0,3).map(o => ({ id: o.id, status: o.status, date: o.date_created })) },
      query_paid_only: { total: jPaid.paging?.total, results: jPaid.results?.length, first_3: (jPaid.results || []).slice(0,3).map(o => ({ id: o.id, status: o.status, date: o.date_created })) },
      query_multi_status: { total: jMulti.paging?.total, results: jMulti.results?.length, first_3: (jMulti.results || []).slice(0,3).map(o => ({ id: o.id, status: o.status, date: o.date_created })) },
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}