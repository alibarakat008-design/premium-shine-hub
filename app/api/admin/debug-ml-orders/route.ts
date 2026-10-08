import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    const acc = await prisma.marketplace_accounts.findFirst({
      where: { account_id: '674217463' },
    })
    if (!acc) return NextResponse.json({ ok: false, error: 'Conta não encontrada' }, { status: 404 })
    const token = acc.access_token

    const SELLER_ID = acc.account_id

    async function mlFetch(url: string) {
      const res = await fetch(`https://api.mercadolibre.com${url}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`)
      return res.json()
    }

    // 1) Filtro date_closed jan-fev 2026
    const df1 = new Date('2026-01-01T00:00:00.000Z').toISOString()
    const dt1 = new Date('2026-02-28T23:59:59.999Z').toISOString()
    const url1 = `/orders/search?seller=${SELLER_ID}&order.status=paid&order.status=confirmed&order.status=delivered&order.status=shipped&order.date_closed.from=${df1}&order.date_closed.to=${dt1}&limit=5&sort=date_desc`
    const r1 = await mlFetch(url1)
    const sample1: any = {}
    if (r1.results?.[0]) {
      const o = r1.results[0]
      sample1.id = o.id
      sample1.date_created = o.date_created
      sample1.date_closed = o.date_closed
      sample1.date_last_updated = o.date_last_updated
      sample1.status = o.status
      // Detalhe
      try {
        const detail = await mlFetch(`/orders/${o.id}`)
        sample1.detalhe_date_closed = detail.date_closed
        sample1.detalhe_date_approved = detail.date_approved
        sample1.detalhe_date_created = detail.date_created
      } catch (e: any) {
        sample1.detail_error = e.message
      }
    }

    // 2) Filtro date_created jan-fev 2026
    const url2 = `/orders/search?seller=${SELLER_ID}&order.status=paid&order.status=confirmed&order.status=delivered&order.status=shipped&order.date_created.from=${df1}&order.date_created.to=${dt1}&limit=5&sort=date_desc`
    const r2 = await mlFetch(url2)

    // 3) Sem filtro
    const url3 = `/orders/search?seller=${SELLER_ID}&order.status=paid&order.status=confirmed&order.status=delivered&order.status=shipped&limit=5&sort=date_desc`
    const r3 = await mlFetch(url3)
    const sample3: any = {}
    if (r3.results?.[0]) {
      const o = r3.results[0]
      sample3.id = o.id
      sample3.date_created = o.date_created
      sample3.date_closed = o.date_closed
      sample3.status = o.status
    }

    // 4) Offset grande pra ver o mais antigo
    const url4 = `/orders/search?seller=${SELLER_ID}&order.status=paid&order.status=confirmed&order.status=delivered&order.status=shipped&limit=5&offset=550&sort=date_desc`
    const r4 = await mlFetch(url4)
    const sample4: any = {}
    if (r4.results?.[0]) {
      const o = r4.results[0]
      sample4.id = o.id
      sample4.date_created = o.date_created
      sample4.date_closed = o.date_closed
      sample4.status = o.status
    }

    return NextResponse.json({
      ok: true,
      seller_id: SELLER_ID,
      r1_date_closed_filter_jan_fev: {
        total: r1.paging?.total,
        results_count: r1.results?.length,
        sample: sample1,
      },
      r2_date_created_filter_jan_fev: {
        total: r2.paging?.total,
        results_count: r2.results?.length,
      },
      r3_no_filter: {
        total: r3.paging?.total,
        sample: sample3,
      },
      r4_offset_550: {
        total: r4.paging?.total,
        results_count: r4.results?.length,
        sample: sample4,
      },
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message, stack: err.stack }, { status: 500 })
  }
}
