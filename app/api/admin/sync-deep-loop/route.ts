/**
 * GET /api/admin/sync-deep-loop?account_id=X&days=N
 *
 * Sync profundo com paginação completa:
 * 1) Busca TODOS os IDs do ML (paginação completa)
 * 2) Chama sync-orders-batch em chunks de 30
 * 3) Retorna resumo consolidado
 *
 * maxDuration: 300 (5 min) - cobre até 200+ vendas
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getMLToken } from '@/lib/ml-auth-multi'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const accountId = searchParams.get('account_id')
  const days = Math.max(1, Math.min(Number(searchParams.get('days') || 30), 730))

  if (!accountId) {
    return NextResponse.json({ ok: false, error: 'account_id obrigatório' }, { status: 400 })
  }

  const acc: any = await prisma.marketplace_accounts.findUnique({ where: { id: accountId } })
  if (!acc) return NextResponse.json({ ok: false, error: 'Conta não encontrada' }, { status: 404 })

  const tokenRes = await getMLToken(acc.company_id)
  if (!tokenRes?.token) return NextResponse.json({ ok: false, error: 'Sem token' }, { status: 401 })
  const token = tokenRes.token

  try {
    // 1) Buscar TODOS os IDs paginando
    const allIds: string[] = []
    const dateFrom = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
    const dateTo = new Date().toISOString()
    let offset = 0
    const pageSize = 50
    while (true) {
      const url = `https://api.mercadolibre.com/orders/search?seller=${acc.account_id}&order.date_created.from=${dateFrom}&order.date_created.to=${dateTo}&limit=${pageSize}&offset=${offset}&sort=date_desc`
      const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      if (!r.ok) break
      const j = await r.json()
      const results = j.results || []
      if (results.length === 0) break
      allIds.push(...results.map((o: any) => String(o.id)))
      if (results.length < pageSize) break
      offset += pageSize
      if (allIds.length > 100000) break // safety (100k vendas max)
    }

    // 2) Quais JÁ existem no DB
    let existingSet = new Set<string>()
    if (allIds.length > 0) {
      const exist: any = await prisma.orders.findMany({
        where: { order_number: { in: allIds } },
        select: { order_number: true },
      })
      existingSet = new Set(exist.map((e: any) => String(e.order_number)))
    }
    const newIds = allIds.filter(id => !existingSet.has(id))

    // 3) Chama sync-orders-batch em chunks de 30
    const BASIC = 'Basic ' + Buffer.from('premium:shine2026').toString('base64')
    let criados = 0
    const errors: string[] = []
    const chunks: number[] = []
    for (let i = 0; i < newIds.length; i += 50) {
      const chunk = newIds.slice(i, i + 50)
      const chunkUrl = `https://premium-shine-hub.vercel.app/api/admin/sync-orders-batch?ids=${chunk.join(',')}&processExisting=false&account_id=${accountId}`
      try {
        const r = await fetch(chunkUrl, { headers: { Authorization: BASIC } })
        const j = await r.json()
        chunks.push(chunk.length)
        criados += j.processed || 0
        if (j.error_samples) errors.push(...j.error_samples)
      } catch (e: any) {
        errors.push(`chunk ${i}: ${e.message?.substring(0, 100)}`)
      }
    }

    return NextResponse.json({
      ok: true,
      account_id: accountId,
      account_nickname: acc.nickname,
      company_id: acc.company_id,
      days,
      ml_total: allIds.length,
      new: newIds.length,
      created: criados,
      chunks: chunks.length,
      errors: errors.length,
      error_samples: errors.slice(0, 3),
      last_run: new Date().toISOString(),
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}