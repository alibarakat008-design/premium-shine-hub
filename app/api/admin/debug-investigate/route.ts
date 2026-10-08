// Debug mais simples
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

async function mlFetch(token: string, url: string) {
  const res = await fetch(`https://api.mercadolibre.com${url}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return res.json()
}

export async function GET(req: NextRequest) {
  const results: any = { ok: true }
  try {
    const account = await prisma.marketplace_accounts.findFirst({
      where: { nickname: 'LIURAESSENCE' },
    })
    results.account = { nickname: account?.nickname, account_id: account?.account_id }
    const token = account?.access_token!
    results.has_token = !!token

    // 1) Contas
    const allAccounts = await prisma.marketplace_accounts.findMany({
      select: { nickname: true, account_id: true, plataforma: true, ativa: true },
    })
    results.accounts = allAccounts

    // 2) Por status
    const statuses = ['paid', 'confirmed', 'handling', 'ready_to_ship', 'shipped', 'delivered', 'cancelled', 'not_paid']
    results.by_status = {}
    for (const st of statuses) {
      try {
        const r = await mlFetch(token, `/orders/search?seller=${account.account_id}&order.status=${st}&limit=1&offset=0`)
        results.by_status[st] = r.paging?.total || 0
      } catch (e: any) {
        results.by_status[st] = `error: ${e.message.slice(0, 100)}`
      }
    }

    // 3) Sample
    const sampleR = await mlFetch(token, `/orders/search?seller=${account.account_id}&order.status=paid&order.status=confirmed&order.status=delivered&order.status=shipped&order.status=handling&order.status=ready_to_ship&limit=5&offset=0&sort=date_desc`)
    results.samples = (sampleR.results || []).map((o: any) => ({
      id: o.id, status: o.status,
      dc: o.date_created?.slice(0, 16),
      dcl: o.date_closed?.slice(0, 16),
      dl: o.date_last_updated?.slice(0, 16),
    }))

    // 4) Testes de janela
    const from = '2026-01-01T00:00:00.000Z'
    const to = '2026-06-30T23:59:59.999Z'

    // Sem filtro
    try {
      const r = await mlFetch(token, `/orders/search?seller=${account.account_id}&limit=1&offset=0`)
      results.sem_filtro = r.paging?.total
    } catch (e: any) { results.sem_filtro = e.message }

    // Status pagos + date_closed
    try {
      const r = await mlFetch(token, `/orders/search?seller=${account.account_id}&order.status=paid&order.status=confirmed&order.status=delivered&order.status=shipped&order.date_closed.from=${from}&order.date_closed.to=${to}&limit=1&offset=0`)
      results.dc_fechado = r.paging?.total
    } catch (e: any) { results.dc_fechado = e.message }

    // Status pagos + date_created
    try {
      const r = await mlFetch(token, `/orders/search?seller=${account.account_id}&order.status=paid&order.status=confirmed&order.status=delivered&order.status=shipped&order.date_created.from=${from}&order.date_created.to=${to}&limit=1&offset=0`)
      results.dc_created = r.paging?.total
    } catch (e: any) { results.dc_created = e.message }

    // Status mais amplo + date_created
    try {
      const r = await mlFetch(token, `/orders/search?seller=${account.account_id}&order.status=paid&order.status=confirmed&order.status=delivered&order.status=shipped&order.status=handling&order.status=ready_to_ship&order.date_created.from=${from}&order.date_created.to=${to}&limit=1&offset=0`)
      results.dc_created_amp = r.paging?.total
    } catch (e: any) { results.dc_created_amp = e.message }

    // Sem status, só date_created
    try {
      const r = await mlFetch(token, `/orders/search?seller=${account.account_id}&order.date_created.from=${from}&order.date_created.to=${to}&limit=1&offset=0`)
      results.dc_only = r.paging?.total
    } catch (e: any) { results.dc_only = e.message }

  } catch (err: any) {
    results.fatal_error = err.message
    results.stack = err.stack
  }
  return NextResponse.json(results)
}
