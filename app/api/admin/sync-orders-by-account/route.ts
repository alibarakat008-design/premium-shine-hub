/**
 * GET /api/admin/sync-orders-by-account?account_id=X&hours=N
 *
 * Sincroniza vendas recentes pra QUALQUER conta ML (não só LIURAESSENCE).
 * Pra rodar em loop (a cada minuto via mavis cron).
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getMLToken } from '@/lib/ml-auth-multi'
import { syncOrdersFromML } from '@/lib/mercadolivre/sync'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const accountId = searchParams.get('account_id')
  const hours = Number(searchParams.get('hours') || 1)

  if (!accountId) {
    return NextResponse.json({ ok: false, error: 'account_id obrigatório' }, { status: 400 })
  }

  // Pega a conta ML
  const acc: any = await prisma.marketplace_accounts.findUnique({
    where: { id: accountId },
  })
  if (!acc) {
    return NextResponse.json({ ok: false, error: 'Conta ML não encontrada' }, { status: 404 })
  }
  const companyId = acc.company_id

  // Verifica token
  const tokenRes = await getMLToken(companyId)
  if (!tokenRes?.token) {
    return NextResponse.json({ ok: false, error: 'Token ML indisponível' }, { status: 401 })
  }

  try {
    // 1) Busca IDs das últimas N horas direto da API (rápido, 1 request)
    const token = tokenRes.token
    const sellerId = Number(acc.account_id)
    const dateFrom = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
    const dateTo = new Date().toISOString()
    const searchUrl = `https://api.mercadolibre.com/orders/search?seller=${sellerId}&order.date_created.from=${dateFrom}&order.date_created.to=${dateTo}&limit=50&sort=date_desc`
    const r = await fetch(searchUrl, { headers: { Authorization: `Bearer ${token}` } })
    if (!r.ok) {
      const txt = await r.text()
      return NextResponse.json({ ok: false, error: `ML ${r.status}: ${txt.substring(0, 200)}` }, { status: 502 })
    }
    const j = await r.json()
    const orderIds = (j.results || []).map((o: any) => String(o.id))

    // 2) Quais JÁ existem no DB?
    let existingSet = new Set<string>()
    if (orderIds.length > 0) {
      const exist: any = await prisma.orders.findMany({
        where: { order_number: { in: orderIds } },
        select: { order_number: true },
      })
      existingSet = new Set(exist.map((e: any) => String(e.order_number)))
    }
    const newIds = orderIds.filter(id => !existingSet.has(id))

    // 3) Se não tem IDs novos, retorna cedo (auto-sync rápido)
    if (newIds.length === 0) {
      return NextResponse.json({
        ok: true,
        account_id: accountId,
        account_nickname: acc.nickname,
        company_id: companyId,
        fetched: orderIds.length,
        new: 0,
        created: 0,
        last_run: new Date().toISOString(),
        message: 'Nada novo pra sincronizar',
      })
    }

    // 4) Processa via syncOrdersFromML (que pega 1h de janela do ML)
    // Limitamos a 30 orders por request pra não estourar timeout (60s)
    const result = await syncOrdersFromML(accountId, { days: 1, all: false, limit: 30 })

    return NextResponse.json({
      ok: true,
      account_id: accountId,
      account_nickname: acc.nickname,
      company_id: companyId,
      fetched: orderIds.length,
      new: newIds.length,
      created: result.criados,
      erros: result.erros.length,
      last_run: new Date().toISOString(),
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}