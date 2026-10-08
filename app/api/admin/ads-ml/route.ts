import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * GET /api/admin/ads-ml?from=2026-04-01&to=2026-06-30
 *
 * Puxa o gasto com Mercado Ads (publicidade) do ML.
 * Endpoint ML: /advertising/advertisers/{advertiser_id}/advertising_bills
 *         ou:   /users/{user_id}/advertising_costs
 *
 * Retorna: array com {date, amount, currency} e total do período.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from') || '2026-04-01'
  const to = searchParams.get('to') || '2026-06-30'

  try {
    const acc = await prisma.marketplace_accounts.findFirst({
      where: { nickname: 'LIURAESSENCE' },
    })
    if (!acc) return NextResponse.json({ ok: false, error: 'Conta não encontrada' }, { status: 404 })

    const token = acc.access_token
    if (!token) return NextResponse.json({ ok: false, error: 'Token não configurado' }, { status: 401 })
    const userId = acc.account_id

    // Tenta primeiro /users/{user_id}/advertising_costs (custos diretos)
    let url = `https://api.mercadolibre.com/users/${userId}/advertising_costs?from=${from}T00:00:00.000Z&to=${to}T23:59:59.999Z`
    let r: any = await fetch(url, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json())

    // Se vazio, tenta /advertising/advertisers
    if (!r.results || r.results.length === 0) {
      const advUrl = `https://api.mercadolibre.com/advertising/advertisers?user_id=${userId}`
      const adv: any = await fetch(advUrl, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json())
      if (adv.advertisers && adv.advertisers[0]) {
        const advertiserId = adv.advertisers[0].id
        // Bills do advertiser
        const billsUrl = `https://api.mercadolibre.com/advertising/advertisers/${advertiserId}/advertising_bills?from=${from}&to=${to}`
        r = await fetch(billsUrl, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json())
      }
    }

    // Salva os valores de ads na tabela orders
    if (r.results && r.results.length > 0) {
      let total = 0
      let updated = 0
      for (const item of r.results) {
        const dateStr = (item.date || item.date_created || '').substring(0, 10)
        const amount = Number(item.amount || item.total || item.cost || 0)
        total += amount
        if (dateStr && amount > 0) {
          // Atualiza todas as orders CRIADAS nessa data com o ads_valor (rateio simples)
          const dt = new Date(`${dateStr}T00:00:00.000Z`)
          const dtEnd = new Date(`${dateStr}T23:59:59.999Z`)
          const upd = await prisma.orders.updateMany({
            where: { created_at: { gte: dt, lte: dtEnd } },
            data: { ads_valor: amount } as any,
          })
          updated += upd.count
        }
      }
      return NextResponse.json({
        ok: true,
        periodo: { from, to },
        total_ads: Number(total.toFixed(2)),
        entries: r.results.length,
        orders_updated: updated,
        sample: r.results.slice(0, 10).map((item: any) => ({
          date: item.date || item.date_created,
          amount: Number(item.amount || item.total || item.cost || 0),
        })),
      })
    }

    return NextResponse.json({
      ok: true,
      periodo: { from, to },
      total_ads: 0,
      entries: 0,
      message: 'Nenhum gasto encontrado nesse período',
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message, stack: e.stack }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}