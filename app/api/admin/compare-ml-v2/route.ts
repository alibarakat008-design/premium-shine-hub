import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getMLToken } from '@/lib/ml-auth-multi'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 120

/**
 * GET /api/admin/compare-ml-v2?days=7&account_id=X
 *
 * VERSÃO CORRIGIDA: faz 1 query por status (não múltiplos status na mesma URL, que o ML não ORa direito)
 * Compara vendas do ML oficial vs nosso DB pra um período.
 *
 * Retorna: { ml_total_per_status, db_total, missing_per_status }
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const days = parseInt(searchParams.get('days') || '7')
    const accountId = searchParams.get('account_id') || null

    // Calcular período
    const endDate = new Date()
    const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000)
    const from = startDate.toISOString().split('T')[0]
    const to = endDate.toISOString().split('T')[0]

    // Achar conta ML
    const acc = accountId
      ? await prisma.marketplace_accounts.findFirst({ where: { id: accountId } })
      : await prisma.marketplace_accounts.findFirst({ where: { nickname: 'LIURAESSENCE' } })

    if (!acc) return NextResponse.json({ ok: false, error: 'Conta ML não encontrada' }, { status: 404 })

    const tokenRes = await getMLToken(acc.company_id || '')
    if (!tokenRes?.token) return NextResponse.json({ ok: false, error: 'Token ML indisponível' }, { status: 401 })
    const token = tokenRes.token
    const SELLER_ID = acc.account_id
    const companyId = acc.company_id

    // 1) Buscar ML — 1 query por status pra pegar TODOS (não confiar no multi-status)
    const statuses = ['paid', 'confirmed', 'delivered', 'shipped', 'handling', 'ready_to_ship', 'cancelled', 'pending', 'in_dispute', 'mediation']
    const mlAll: any[] = []
    const mlByStatus: Record<string, any[]> = {}
    const limit = 50

    for (const status of statuses) {
      let offset = 0
      const ordersThisStatus: any[] = []
      for (let i = 0; i < 30; i++) {
        const url = `https://api.mercadolibre.com/orders/search?seller=${SELLER_ID}&order.status=${status}&order.date_created.from=${startDate.toISOString()}&order.date_created.to=${endDate.toISOString()}&limit=${limit}&offset=${offset}&sort=date_desc`
        const r: any = await fetch(url, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json())
        if (!r.results || r.results.length === 0) break
        ordersThisStatus.push(...r.results)
        if (!r.paging || r.paging.offset + limit >= (r.paging.total || 0)) break
        offset += limit
      }
      if (ordersThisStatus.length > 0) {
        mlByStatus[status] = ordersThisStatus
        mlAll.push(...ordersThisStatus)
      }
    }

    // Deduplicar (mesma venda pode ter mudado de status)
    const seen = new Set<string>()
    const mlUnique = mlAll.filter(o => {
      if (seen.has(String(o.id))) return false
      seen.add(String(o.id))
      return true
    })

    // 2) DB
    const dbOrders = await prisma.orders.findMany({
      where: {
        company_id: companyId,
        OR: [
          { pago_em: { gte: startDate, lte: endDate } },
          { AND: [{ pago_em: null }, { created_at: { gte: startDate, lte: endDate } }] },
        ],
      },
      select: { id: true, order_number: true, total: true, status: true, created_at: true, pago_em: true },
    })

    // 3) Comparar
    const dbSet = new Set(dbOrders.map(o => String(o.order_number)))
    const mlSet = new Set(mlUnique.map(o => String(o.id)))
    const missing = mlUnique.filter(o => !dbSet.has(String(o.id)))
    const extras = dbOrders.filter(o => !mlSet.has(String(o.order_number)))

    // 4) Resumo
    const mlReceita = mlUnique.reduce((s, o) => s + Number(o.total_amount || 0), 0)
    const dbReceita = dbOrders.reduce((s, o) => s + Number(o.total || 0), 0)
    const mlPerStatus: Record<string, { count: number; receita: number }> = {}
    for (const [st, arr] of Object.entries(mlByStatus)) {
      mlPerStatus[st] = {
        count: new Set(arr.map(o => String(o.id))).size,
        receita: Number(arr.reduce((s, o) => s + Number(o.total_amount || 0), 0).toFixed(2)),
      }
    }

    return NextResponse.json({
      ok: true,
      periodo: { from, to, days },
      ml: {
        total: mlUnique.length,
        receita: Number(mlReceita.toFixed(2)),
        per_status: mlPerStatus,
        windows: `${statuses.length} status × ${days} dias`,
      },
      db: {
        total: dbOrders.length,
        receita: Number(dbReceita.toFixed(2)),
      },
      missing_no_db: {
        total: missing.length,
        receita: Number(missing.reduce((s, o) => s + Number(o.total_amount || 0), 0).toFixed(2)),
        sample: missing.slice(0, 20).map(o => ({ order_number: o.id, status: o.status, date_created: o.date_created, total: o.total_amount })),
      },
      extras_no_ml: {
        total: extras.length,
        receita: Number(extras.reduce((s, o) => s + Number(o.total || 0), 0).toFixed(2)),
        sample: extras.slice(0, 20).map(o => ({ order_number: o.order_number, status: o.status, created_at: o.created_at, total: Number(o.total) })),
      },
      diff_count: mlUnique.length - dbOrders.length,
      diff_receita: Number((mlReceita - dbReceita).toFixed(2)),
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message, stack: e.stack }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}
