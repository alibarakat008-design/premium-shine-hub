// Endpoint simplificado - debug de onde crasha
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

async function mlFetch(token: string, url: string) {
  const res = await fetch(`https://api.mercadolibre.com${url}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return res.json()
}

export async function POST(req: NextRequest) {
  const log: string[] = []
  try {
    const { searchParams } = new URL(req.url)
    const mesParam = searchParams.get('mes')
    log.push(`mes=${mesParam}`)
    if (!mesParam) return NextResponse.json({ ok: false, error: 'mes required' }, { status: 400 })

    const [y, m] = mesParam.split('-').map(Number)
    if (!y || !m || m < 1 || m > 12) return NextResponse.json({ ok: false, error: 'mes invalid' }, { status: 400 })

    log.push(`y=${y} m=${m}`)

    // 1) Pegar account
    const account = await prisma.marketplace_accounts.findFirst({
      where: { nickname: 'LIURAESSENCE' },
    })
    if (!account) return NextResponse.json({ ok: false, error: 'no account', log }, { status: 404 })
    log.push(`account ok, has_token=${!!account.access_token}`)

    const company = await prisma.companies.findFirst({ where: { ativa: true } })
      || await prisma.companies.findFirst()
    if (!company) return NextResponse.json({ ok: false, error: 'no company', log }, { status: 404 })
    log.push(`company ok`)

    const from = new Date(y, m - 1, 1)
    const to = new Date(y, m, 1)
    const dateFrom = from.toISOString()
    const dateTo = to.toISOString()
    log.push(`dates ${dateFrom} → ${dateTo}`)

    // 2) ML search
    const url = `/orders/search?seller=${account.account_id}&order.status=paid&order.date_closed.from=${dateFrom}&order.date_closed.to=${dateTo}&limit=10&offset=0&sort=date_desc`
    const search = await mlFetch(account.access_token!, url)
    const results = search.results || []
    log.push(`ML retornou ${results.length} orders`)

    if (results.length === 0) {
      return NextResponse.json({ ok: true, log, message: 'nenhuma order nesse mês' })
    }

    // 3) Mostrar sample
    const sample = results.slice(0, 3).map((o: any) => ({
      id: o.id,
      total: o.total_amount,
      status: o.status,
      date_closed: o.date_closed,
    }))

    // 4) Testar findMany
    const ids = results.map((o: any) => String(o.id))
    log.push(`buscando existentes: ${ids.length} ids`)
    log.push(`primeiro id: ${ids[0]}`)
    try {
      const existingList = await prisma.orders.findMany({
        where: { order_number: { in: ids } },
        select: { order_number: true },
      })
      log.push(`já existem: ${existingList.length}`)
    } catch (e: any) {
      log.push(`ERRO findMany: ${e.message}`)
      return NextResponse.json({ ok: false, error: e.message, log }, { status: 500 })
    }

    return NextResponse.json({ ok: true, log, sample, total_pagas_ml: search.paging?.total })
  } catch (err: any) {
    console.error('SYNC DEBUG ERR:', err.message, err.stack)
    log.push(`ERROR: ${err.message}`)
    return NextResponse.json({ ok: false, error: err.message, stack: err.stack, log }, { status: 500 })
  }
}
