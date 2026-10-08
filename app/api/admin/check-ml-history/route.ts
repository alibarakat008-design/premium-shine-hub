/**
 * CHECK-ML-HISTORY: consulta Mercado Livre pra ver até quando tem vendas
 *
 * Usa /orders/search?date_created.from=2024-01-01T00:00:00.000-00:00
 * pra ver se tem vendas antes de 2026
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const BASIC = 'Basic ' + Buffer.from('premium:shine2026').toString('base64')

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== BASIC) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  const companyId = req.nextUrl.searchParams.get('company_id') || 'e2633570-74da-4b14-9ca1-ba7b0670e612'

  try {
    // Pega token ML
    const acc: any[] = await prisma.$queryRawUnsafe(`
      SELECT id, access_token, account_id as ml_user_id
      FROM marketplace_accounts
      WHERE company_id = $1::uuid AND plataforma = 'mercado_livre'
      LIMIT 1
    `, companyId)
    if (acc.length === 0) {
      return NextResponse.json({ ok: false, error: 'Sem conta ML' })
    }
    const token = acc[0].access_token
    const userId = Number(acc[0].ml_user_id)

    // Testa 2024-2025 (todos status)
    const r1 = await fetch(`https://api.mercadolibre.com/orders/search?seller=${userId}&order.date_created.from=2024-01-01T00:00:00.000-00:00&order.date_created.to=2025-12-31T23:59:59.000-00:00&limit=1`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    const j1 = await r1.json()
    const tem2024_2025 = j1.paging?.total || 0

    // Testa primeira venda (todos status, sem status filter)
    const r2 = await fetch(`https://api.mercadolibre.com/orders/search?seller=${userId}&sort=date_asc&limit=1`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    const j2 = await r2.json()
    const primeira = j2.results?.[0]?.date_created || null
    const primeiraStatus = j2.results?.[0]?.status || null

    // Total geral
    const r3 = await fetch(`https://api.mercadolibre.com/orders/search?seller=${userId}&limit=1`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    const j3 = await r3.json()
    const totalML = j3.paging?.total || 0

    return NextResponse.json({
      ok: true,
      ml_user_id: userId,
      total_ML: totalML,
      vendas_2024_2025_no_ML: tem2024_2025,
      primeira_venda_ML: primeira,
      primeira_venda_status: primeiraStatus,
      db_total: 25906,
      db_primeira: '2026-01-19T16:40:13.000Z',
      mensagem: tem2024_2025 === 0
        ? '✅ Conta LIURA realmente só tem vendas a partir de 2026. Não tem histórico anterior.'
        : `⚠️ Tem ${tem2024_2025} vendas em 2024-2025 que faltam puxar!`,
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message })
  } finally {
    await prisma.$disconnect()
  }
}
