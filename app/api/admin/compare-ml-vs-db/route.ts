import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getMLToken } from '@/lib/ml-auth-multi'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 120

/**
 * GET /api/admin/compare-ml-vs-db?from=2026-07-03&to=2026-07-08&account_id=X
 *
 * Compara vendas do ML oficial vs nosso DB pra um período.
 * Lista os order_numbers que estão no ML mas NÃO no nosso DB.
 *
 * Retorna:
 *   { ml_total, db_total, missing: [...], ml_summary, db_summary }
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const from = searchParams.get('from') || '2026-07-01'
    const to = searchParams.get('to') || '2026-07-08'
    const accountIdParam = searchParams.get('account_id') || null

    // Aceita account_id (qualquer conta) OU fallback pra LIURAESSENCE
    const acc = accountIdParam
      ? await prisma.marketplace_accounts.findFirst({ where: { id: accountIdParam } })
      : await prisma.marketplace_accounts.findFirst({ where: { nickname: 'LIURAESSENCE' } })
    if (!acc) return NextResponse.json({ ok: false, error: 'Conta ML não encontrada' }, { status: 404 })

    // IMPORTANTE: usar getMLToken (pega o token válido da company, com auto-refresh)
    // acc.access_token pode estar expirado
    const tokenRes = await getMLToken(acc.company_id || '')
    if (!tokenRes?.token) return NextResponse.json({ ok: false, error: 'Token ML indisponível' }, { status: 401 })
    const token = tokenRes.token
    const SELLER_ID = acc.account_id

    // 1) Buscar todas as vendas do ML no período
    // CORREÇÃO (jul/2026):
    // 1. ML não faz OR de múltiplos `order.status=X` na URL — só retorna o primeiro
    // 2. Loop anterior `for (let i = 0; i < 20; i++)` limitava a 20 iterações = 1000 vendas
    //    O bug fazia o endpoint retornar SÓ ~1183 vendas, ignorando as outras ~500-5000
    // 3. ML aceita SÓ estes status: paid, confirmed, cancelled, payment_required, payment_in_process, invalid
    //    (delivered, shipped, etc retornam HTTP 400)
    // Solução: 1 query por status VÁLIDO, paginação COMPLETA (até paging.total)
    const mlOrders: any[] = []
    const limit = 50
    const statuses = ['paid', 'confirmed', 'cancelled', 'payment_required', 'payment_in_process', 'invalid']

    // Quebra o período em janelas de 7 dias (cinto-e-suspensório: ML limita ~1000 results por query)
    const startDate = new Date(`${from}T00:00:00.000Z`)
    const endDate = new Date(`${to}T23:59:59.999Z`)
    const windowDays = 7
    const windows: { from: string; to: string }[] = []
    for (let d = new Date(startDate); d < endDate; d.setDate(d.getDate() + windowDays)) {
      const winStart = new Date(d)
      const winEnd = new Date(Math.min(d.getTime() + windowDays * 24 * 60 * 60 * 1000, endDate.getTime()))
      windows.push({ from: winStart.toISOString(), to: winEnd.toISOString() })
    }

    for (const status of statuses) {
      for (const w of windows) {
        let offset = 0
        // Paginação COMPLETA: ir até paging.total
        // Limite de segurança: 10000 vendas (não é realista o ML ter mais que isso num período)
        for (let i = 0; i < 200; i++) {
          const url = `https://api.mercadolibre.com/orders/search?seller=${SELLER_ID}&order.status=${status}&order.date_created.from=${w.from}&order.date_created.to=${w.to}&limit=${limit}&offset=${offset}&sort=date_desc`
          const r: any = await fetch(url, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json())
          if (!r.results || r.results.length === 0) break
          mlOrders.push(...r.results)
          if (!r.paging || r.paging.offset + limit >= (r.paging.total || 0)) break
          offset += limit
        }
      }
    }
    // Deduplicar (mesma venda pode ter mudado de status, aparecendo em 2 queries)
    const seen = new Set<string>()
    const mlOrdersUnique = mlOrders.filter(o => {
      if (seen.has(String(o.id))) return false
      seen.add(String(o.id))
      return true
    })

    // 2) Buscar vendas do DB no mesmo período
    // IMPORTANTE: filtrar por `pago_em` (data do pedido no ML), não `created_at` (data de inserção no DB)
    // Senão vendas recém-criadas de meses passados não aparecem no filtro.
    // MULTI-TENANT: filtrar por company_id (cada conta ML = 1 empresa)
    const dbStartDate = new Date(`${from}T00:00:00.000Z`)
    const dbEndDate = new Date(`${to}T23:59:59.999Z`)
    const dbOrders = await prisma.orders.findMany({
      where: {
        company_id: acc.company_id,
        OR: [
          { pago_em: { gte: dbStartDate, lte: dbEndDate } },
          // Fallback: algumas vendas podem não ter pago_em, usar created_at
          { AND: [
            { pago_em: null },
            { created_at: { gte: dbStartDate, lte: dbEndDate } },
          ]},
        ],
      },
      select: { id: true, order_number: true, total: true, created_at: true, pago_em: true, status: true },
    })

    // 3) Comparar
    const dbOrderNumbers = new Set(dbOrders.map(o => String(o.order_number)))
    const mlOrderNumbers = new Set(mlOrdersUnique.map(o => String(o.id)))
    const missing = mlOrdersUnique.filter(o => !dbOrderNumbers.has(String(o.id)))
    const extras = dbOrders.filter(o => !mlOrderNumbers.has(String(o.order_number)))

    // 4) Resumo
    const mlTotal = mlOrdersUnique.reduce((s, o) => s + Number(o.total_amount || 0), 0)
    const dbTotal = dbOrders.reduce((s, o) => s + Number(o.total || 0), 0)
    const mlSummary: Record<string, number> = {}
    mlOrdersUnique.forEach(o => {
      const s = o.status || 'unknown'
      mlSummary[s] = (mlSummary[s] || 0) + 1
    })

    return NextResponse.json({
      ok: true,
      periodo: { from, to },
      ml: {
        total: mlOrdersUnique.length,
        summary_status: mlSummary,
        receita: Number(mlTotal.toFixed(2)),
        windows_used: windows.length,
        statuses_searched: statuses.length,
      },
      db: {
        total: dbOrders.length,
        receita: Number(dbTotal.toFixed(2)),
      },
      missing_no_db: {
        total: missing.length,
        sample: missing.slice(0, 20).map(o => ({
          order_number: o.id,
          status: o.status,
          date_created: o.date_created,
          total: o.total_amount,
          shipping_mode: o.shipping?.mode,
        })),
      },
      extras_no_ml: {
        total: extras.length,
        sample: extras.slice(0, 20).map(o => ({
          order_number: o.order_number,
          status: o.status,
          created_at: o.created_at,
          total: Number(o.total),
        })),
      },
      diff_count: mlOrdersUnique.length - dbOrders.length,
      diff_receita: Number((mlTotal - dbTotal).toFixed(2)),
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message, stack: e.stack }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}