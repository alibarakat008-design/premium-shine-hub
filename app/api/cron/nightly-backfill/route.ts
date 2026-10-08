/**
 * GET /api/cron/nightly-backfill
 *
 * Cron noturno que faz BACKFILL COMPLETO de todas as contas ML.
 * Pra cada empresa parceira com token ML válido:
 *   1) Lista TODOS os order_ids do último ano (paginação completa)
 *   2) Filtra os que JÁ existem no DB
 *   3) Cria os que faltam (em chunks de 50)
 *   4) Rate limit handling
 *
 * Continua de onde parou (idempotente). Roda todo dia à meia-noite.
 *
 * Auth: Authorization: Bearer <CRON_SECRET>
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getMLToken } from '@/lib/ml-auth-multi'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300 // 5 min por execução

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

async function fetchAllMLIds(
  userId: string,
  token: string,
  dateFrom: string,
  dateTo: string
): Promise<{ ids: string[]; rateLimited: boolean; error?: string }> {
  const allIds: string[] = []
  let offset = 0
  const pageSize = 50
  let rateLimited = false

  while (true) {
    const url = `https://api.mercadolibre.com/orders/search?seller=${userId}&order.status=paid&order.date_created.from=${dateFrom}&order.date_created.to=${dateTo}&limit=${pageSize}&offset=${offset}&sort=date_desc`
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })

    if (r.status === 429) {
      rateLimited = true
      await sleep(65000)
      continue
    }
    if (!r.ok) {
      return { ids: allIds, rateLimited, error: `ML ${r.status}` }
    }

    const j = await r.json()
    const results = j.results || []
    if (results.length === 0) break
    allIds.push(...results.map((o: any) => String(o.id)))
    if (results.length < pageSize) break
    offset += pageSize
    if (allIds.length >= 5000) break // safety por execução
    await sleep(100)
  }
  return { ids: allIds, rateLimited }
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET || 'shinecron2026'
  const isCron = authHeader === `Bearer ${cronSecret}`
  const isAdmin = authHeader === `Basic ${Buffer.from('premium:shine2026').toString('base64')}`
  if (!isCron && !isAdmin) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const startTime = Date.now()
  const results: any[] = []

  try {
    // Lista todas as companies com token ML válido
    const companies: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        c.id, c.nome_fantasia, c.ml_user_id::text, c.ml_expires_at,
        ma.id AS account_id, ma.nickname AS account_nickname
      FROM companies c
      JOIN marketplace_accounts ma ON ma.company_id = c.id AND ma.plataforma = 'mercado_livre'
      WHERE c.ativa = true
        AND c.access_token_ml IS NOT NULL
        AND c.refresh_token_ml IS NOT NULL
        AND c.ml_user_id IS NOT NULL
      ORDER BY c.nome_fantasia
    `)

    if (companies.length === 0) {
      return NextResponse.json({
        ok: true,
        message: 'Nenhuma company com token ML ativo',
        companies_processed: 0,
      })
    }

    const dateTo = new Date().toISOString()
    const dateFrom = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString()
    const BASIC = 'Basic ' + Buffer.from('premium:shine2026').toString('base64')
    const base = 'https://premium-shine-hub.vercel.app'

    for (const company of companies) {
      const cResult: any = {
        company_id: company.id,
        company_name: company.nome_fantasia,
        account_nickname: company.account_nickname,
        ml_ids: 0,
        ja_existiam: 0,
        criados: 0,
        rate_limited: false,
        errors: [] as string[],
        skipped: false,
      }

      // Verifica timeout global (5min - 30s margem)
      if (Date.now() - startTime > 270000) {
        cResult.skipped = true
        cResult.errors.push('Timeout: pulado por limite de tempo')
        results.push(cResult)
        continue
      }

      try {
        const tokenInfo = await getMLToken(company.id)
        if (!tokenInfo?.token) {
          cResult.errors.push('Token ML indisponível')
          results.push(cResult)
          continue
        }

        // 1) Lista TODAS as order_ids PAID do último ano
        const { ids: allIds, rateLimited, error: mlError } = await fetchAllMLIds(
          company.ml_user_id,
          tokenInfo.token,
          dateFrom,
          dateTo
        )
        cResult.ml_ids = allIds.length
        cResult.rate_limited = rateLimited
        if (mlError) cResult.errors.push(`ML: ${mlError}`)

        if (allIds.length === 0) {
          results.push(cResult)
          continue
        }

        // 2) Filtra as que JÁ existem no DB
        const existing: any[] = await prisma.orders.findMany({
          where: { order_number: { in: allIds } },
          select: { order_number: true },
        })
        const existingSet = new Set(existing.map((e: any) => String(e.order_number)))
        const newIds = allIds.filter(id => !existingSet.has(id))
        cResult.ja_existiam = existingSet.size
        cResult.novos = newIds.length

        if (newIds.length === 0) {
          results.push(cResult)
          continue
        }

        // 3) Cria em chunks de 50
        for (let i = 0; i < newIds.length; i += 50) {
          if (Date.now() - startTime > 285000) {
            cResult.errors.push('Timeout: parou no meio')
            break
          }

          const chunk = newIds.slice(i, i + 50)
          try {
            const r = await fetch(
              `${base}/api/admin/sync-orders-batch?ids=${chunk.join(',')}&processExisting=false&account_id=${company.account_id}`,
              { headers: { Authorization: BASIC } }
            )
            const j = await r.json()
            cResult.criados += j.processed || 0
            if (j.rate_limited) cResult.rate_limited = true
            if (j.error_samples) cResult.errors.push(...j.error_samples.slice(0, 1))
          } catch (e: any) {
            cResult.errors.push(`chunk ${i}: ${e.message?.substring(0, 100)}`)
          }
          await sleep(300)
        }
      } catch (e: any) {
        cResult.errors.push(`Exceção: ${e.message?.substring(0, 150)}`)
      }

      results.push(cResult)
    }

    const totalCriados = results.reduce((s: number, r: any) => s + r.criados, 0)
    const totalNovos = results.reduce((s: number, r: any) => s + (r.novos || 0), 0)
    const totalErrors = results.reduce((s: number, r: any) => s + r.errors.length, 0)
    const duration = Math.round((Date.now() - startTime) / 1000)

    return NextResponse.json({
      ok: true,
      mode: 'nightly-backfill',
      companies_processed: results.length,
      total_novos: totalNovos,
      total_criados: totalCriados,
      total_errors: totalErrors,
      duration_seconds: duration,
      results,
      last_run: new Date().toISOString(),
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}
