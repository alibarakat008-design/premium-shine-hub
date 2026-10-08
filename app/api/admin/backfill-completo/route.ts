/**
 * Backfill robusto: puxa TODAS as vendas de uma conta ML.
 *
 * Melhorias vs sync-deep-loop:
 *  - Rate limit handling (espera 60s quando ML retorna 429)
 *  - Aceita startDate/endDate especificos
 *  - Salva progresso em temp (pula vendas ja processadas)
 *  - Processa em chunks de 50 vendas
 *  - Continua de onde parou
 *
 * GET /api/admin/backfill-completo?account_id=X&startDate=2025-01-01&endDate=2026-07-15
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getMLToken } from '@/lib/ml-auth-multi'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const t0 = Date.now()
  const { searchParams } = new URL(req.url)
  const accountId = searchParams.get('account_id')
  // Aceita startDate/endDate OU days
  const startDateParam = searchParams.get('startDate')
  const endDateParam = searchParams.get('endDate') || new Date().toISOString()
  const days = Math.max(1, Math.min(Number(searchParams.get('days') || 30), 730))
  const maxBatches = Math.max(1, Math.min(Number(searchParams.get('max_batches') || 50), 200))
  const batchSize = Math.max(10, Math.min(Number(searchParams.get('batch_size') || 50), 100))

  if (!accountId) {
    return NextResponse.json({ ok: false, error: 'account_id obrigatorio' }, { status: 400 })
  }

  const acc: any = await prisma.marketplace_accounts.findUnique({ where: { id: accountId } })
  if (!acc) return NextResponse.json({ ok: false, error: 'Conta nao encontrada' }, { status: 404 })

  const tokenRes = await getMLToken(acc.company_id)
  if (!tokenRes?.token) return NextResponse.json({ ok: false, error: 'Sem token' }, { status: 401 })
  const token = tokenRes.token

  // Calcula datas
  const dateTo = endDateParam
  const dateFrom = startDateParam || new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  try {
    console.log('[backfill] Iniciando: account=' + acc.nickname + ' de=' + dateFrom + ' ate=' + dateTo + ' batch_size=' + batchSize)

    // 1) Pega TODOS os IDs paginando (com retry on 429)
    const allIds: string[] = []
    let offset = 0
    const pageSize = 50
    let rateLimitHits = 0

    while (true) {
      const url = `https://api.mercadolibre.com/orders/search?seller=${acc.account_id}&order.date_created.from=${dateFrom}&order.date_created.to=${dateTo}&limit=${pageSize}&offset=${offset}&sort=date_desc`
      const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })

      if (r.status === 429) {
        rateLimitHits++
        if (rateLimitHits > 5) {
          return NextResponse.json({
            ok: false,
            error: 'Rate limit excessivo. Tente novamente em 1min.',
            rateLimitHits,
            allIds_ate_agora: allIds.length,
          }, { status: 429 })
        }
        console.log('[backfill] Rate limit (429), esperando 60s...')
        await new Promise(r => setTimeout(r, 60000))
        continue  // retry
      }

      if (!r.ok) {
        return NextResponse.json({ ok: false, error: `ML ${r.status}` }, { status: 502 })
      }

      const j = await r.json()
      const results = j.results || []
      if (results.length === 0) break
      allIds.push(...results.map((o: any) => String(o.id)))
      if (results.length < pageSize) break
      offset += pageSize
      if (allIds.length > 100000) break
      // Pequeno delay pra nao bater rate limit
      await new Promise(r => setTimeout(r, 100))
    }

    console.log('[backfill] IDs coletados: ' + allIds.length + ' rate_limit_hits=' + rateLimitHits)

    // 2) Quais JÁ existem no DB (filtra os que faltam)
    let existingSet = new Set<string>()
    if (allIds.length > 0) {
      const exist: any[] = await prisma.$queryRawUnsafe(`
        SELECT order_number::text as order_number
        FROM orders
        WHERE order_number = ANY($1::text[])
      `, allIds)
      existingSet = new Set(exist.map((e: any) => e.order_number))
    }
    const newIds = allIds.filter(id => !existingSet.has(id))
    console.log('[backfill] IDs novos: ' + newIds.length + ' (ja_existiam: ' + existingSet.size + ')')

    if (newIds.length === 0) {
      return NextResponse.json({
        ok: true,
        message: 'Nada novo pra processar',
        ml_total: allIds.length,
        novos: 0,
        criados: 0,
        rateLimitHits,
        duracao_ms: Date.now() - t0,
      })
    }

    // 3) Processa em chunks (com rate limit handling)
    const BASIC = 'Basic ' + Buffer.from('premium:shine2026').toString('base64')
    let criados = 0
    const errors: string[] = []
    const chunkTimes: number[] = []
    let consecutiveRateLimit = 0

    for (let i = 0; i < newIds.length && i < maxBatches * batchSize; i += batchSize) {
      const chunk = newIds.slice(i, i + batchSize)
      const chunkUrl = `https://premium-shine-hub.vercel.app/api/admin/sync-orders-batch?ids=${chunk.join(',')}&processExisting=false&account_id=${accountId}`

      const chunkStart = Date.now()
      try {
        const r = await fetch(chunkUrl, { headers: { Authorization: BASIC } })
        const j = await r.json()
        criados += j.processed || 0
        chunkTimes.push(Date.now() - chunkStart)
        if (j.error_samples) errors.push(...j.error_samples.slice(0, 3))

        if (j.rate_limited) {
          consecutiveRateLimit++
          if (consecutiveRateLimit > 3) {
            console.log('[backfill] Rate limit persistente, parando')
            break
          }
          console.log('[backfill] Rate limit no batch, esperando 65s...')
          await new Promise(r => setTimeout(r, 65000))
        } else {
          consecutiveRateLimit = 0
        }

        // Log a cada 5 chunks
        if (i % (batchSize * 5) === 0) {
          console.log('[backfill] Processados ' + (i + chunk.length) + '/' + newIds.length + ' criados=' + criados)
        }
      } catch (e: any) {
        errors.push(`chunk ${i}: ${e.message?.substring(0, 100)}`)
      }

      // Se já passou do tempo, para
      if (Date.now() - t0 > 280000) {
        console.log('[backfill] Tempo limite atingido, parando')
        break
      }
    }

    return NextResponse.json({
      ok: true,
      account_id: accountId,
      account_nickname: acc.nickname,
      company_id: acc.company_id,
      dateFrom,
      dateTo,
      ml_total: allIds.length,
      ja_existiam: existingSet.size,
      novos: newIds.length,
      criados,
      processados: Math.min(newIds.length, maxBatches * batchSize),
      chunks: Math.ceil(Math.min(newIds.length, maxBatches * batchSize) / batchSize),
      rateLimitHits,
      errors: errors.length > 0 ? errors.slice(0, 5) : [],
      duracao_ms: Date.now() - t0,
      message: criados > 0
        ? `Criados ${criados} vendas. Faltam processar ~${newIds.length - (criados * batchSize)} vendas.`
        : 'Nada criado neste round (rate limit ou ja tinha).',
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message, stack: err.stack }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}
