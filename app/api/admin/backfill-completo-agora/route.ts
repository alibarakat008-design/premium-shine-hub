/**
 * BACKFILL-COMPLETO-AHORA: puxa TODAS as vendas que faltam no DB
 *
 * Usa paginação completa do /orders/search
 * GET /api/admin/backfill-completo-agora?company_id=X&days=N
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

const BASIC = 'Basic ' + Buffer.from('premium:shine2026').toString('base64')
const ML_BASE = 'https://api.mercadolibre.com'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== BASIC) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  const companyId = req.nextUrl.searchParams.get('company_id') || 'e2633570-74da-4b14-9ca1-ba7b0670e612'
  const days = Number(req.nextUrl.searchParams.get('days') || 365)

  try {
    const acc: any[] = await prisma.$queryRawUnsafe(`
      SELECT id, access_token, account_id as ml_user_id
      FROM marketplace_accounts
      WHERE company_id = $1::uuid AND plataforma = 'mercado_livre'
      LIMIT 1
    `, companyId)
    if (acc.length === 0) return NextResponse.json({ ok: false, error: 'Sem conta ML' })
    const token = acc[0].access_token
    const userId = Number(acc[0].ml_user_id)
    const accountId = acc[0].id

    // Pega todas as orders do ML via paginação
    const timeFrom = new Date(Date.now() - days * 86400 * 1000).toISOString()
    const timeTo = new Date().toISOString()
    const allOrderIds: number[] = []
    let offset = 0
    const limit = 50
    const t0 = Date.now()

    // ML /orders/search suporta até 10.000 resultados via offset (200 páginas de 50)
    // Pra mais, precisa /orders/search?scroll_id=... (mas com bug)
    // Como fallback, usa múltiplas janelas
    const janelas: Array<{ from: string, to: string }> = []
    const fromDate = new Date(timeFrom)
    const toDate = new Date(timeTo)
    const windowDays = 30
    let cur = new Date(fromDate)
    while (cur < toDate) {
      const next = new Date(cur)
      next.setDate(next.getDate() + windowDays)
      if (next > toDate) next.setTime(toDate.getTime())
      janelas.push({ from: cur.toISOString(), to: next.toISOString() })
      cur = next
    }

    for (const janela of janelas) {
      let offset = 0
      while (true) {
        const url = `${ML_BASE}/orders/search?seller=${userId}&order.date_created.from=${janela.from}&order.date_created.to=${janela.to}&limit=50&offset=${offset}`
        const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
        const j = await r.json()
        if (!j.results || j.results.length === 0) break
        for (const o of j.results) allOrderIds.push(o.id)
        if (j.results.length < 50) break
        offset += 50
        if (offset > 9500) break // safety por janela
      }
    }

    // Pega order_number (ML ID) que JÁ existem no DB
    const existentes: any[] = await prisma.$queryRawUnsafe(`
      SELECT order_number FROM orders WHERE company_id = $1::uuid
    `, companyId)
    const existingSet = new Set(existentes.map((e: any) => String(e.order_number)))
    console.log(`[backfill-completo-agora] existentes=${existentes.length}, allOrderIds=${allOrderIds.length}, existingSet.size=${existingSet.size}`)

    // Testa manualmente com 1 ID
    const testId = '2000017212770684'
    const testInSet = existingSet.has(testId)
    const testInDb = existentes.some((e: any) => String(e.order_number) === testId)
    console.log(`[backfill-completo-agora] test ${testId}: inSet=${testInSet}, inDb=${testInDb}`)

    const faltantes = allOrderIds.filter(id => !existingSet.has(String(id)))

    return NextResponse.json({
      ok: true,
      total_ML: allOrderIds.length,
      total_DB: existingSet.size,
      test_id: testId,
      test_in_set: testInSet,
      test_in_db: testInDb,
      faltam: faltantes.length,
      ids_faltantes: faltantes.slice(0, 50),
      mensagem: faltantes.length === 0
        ? '✅ DB e ML estão em dia!'
        : `Use /api/admin/sync-orders-batch?ids=${faltantes.join(',').slice(0, 200)}&account_id=${accountId} pra puxar`,
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message, stack: e.stack?.substring(0, 500) })
  } finally {
    await prisma.$disconnect()
  }
}
