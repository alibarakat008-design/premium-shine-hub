/**
 * GET /api/cron/sync-all-partners?days=7&max_per_company=500
 *
 * Cron noturno que sincroniza vendas NOVAS de TODOS os parceiros com token ML ativo.
 *
 * Estratégia:
 * 1. Lista todas as companies parceiras com access_token_ml ativo
 * 2. Pra cada uma, busca vendas via /orders/search com paginação completa
 * 3. Filtra as que JÁ existem no DB
 * 4. Processa via sync-orders-batch em chunks
 * 5. Tem rate limit handling (espera 60s quando ML retorna 429)
 *
 * Diferença do sync-parceiros:
 * - Esse aqui faz paginação completa (não só primeira página)
 * - Usa `seller=account_id` em vez de `seller=me` (mais confiável)
 * - Trata rate limit de 60 req/min
 * - Processa TODOS os status (paid, confirmed, cancelled, etc)
 *
 * Auth: Authorization: Bearer <CRON_SECRET> OU Basic Auth
 * maxDuration: 300 (5 min) - cobre até 4-5 empresas
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getMLToken } from '@/lib/ml-auth-multi'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

const BASIC = 'Basic ' + Buffer.from('premium:shine2026').toString('base64')
const BASE_URL = 'https://premium-shine-hub.vercel.app'

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

async function fetchAllMLOrderIds(
  sellerId: string,
  token: string,
  daysBack: number
): Promise<{ ids: string[]; rateLimited: boolean }> {
  const allIds: string[] = []
  const dateFrom = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString()
  const dateTo = new Date().toISOString()
  const pageSize = 50
  let offset = 0
  let rateLimited = false

  while (true) {
    const url = `https://api.mercadolibre.com/orders/search?seller=${sellerId}&order.date_created.from=${dateFrom}&order.date_created.to=${dateTo}&limit=${pageSize}&offset=${offset}&sort=date_desc`
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })

    if (r.status === 429) {
      rateLimited = true
      // Espera 65s e tenta de novo essa mesma página
      await sleep(65000)
      continue
    }
    if (!r.ok) break

    const j = await r.json()
    const results = j.results || []
    if (results.length === 0) break

    allIds.push(...results.map((o: any) => String(o.id)))
    if (results.length < pageSize) break
    offset += pageSize
    if (allIds.length >= 5000) break // safety: 5k vendas max por cron
    await sleep(150) // evita rate limit
  }
  return { ids: [...new Set(allIds)], rateLimited }
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET || 'shinecron2026'
  const isCron = authHeader === `Bearer ${cronSecret}`
  const isAdmin = authHeader === BASIC
  if (!isCron && !isAdmin) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const days = Math.max(1, Math.min(Number(searchParams.get('days') || 7), 30))
  const maxPerCompany = Math.max(100, Math.min(Number(searchParams.get('max_per_company') || 500), 2000))

  const startTime = Date.now()
  const results: any[] = []

  try {
    // 1. Lista todas as companies com token ML (getMLToken faz auto-refresh se expirado)
    const companies: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        c.id, c.nome_fantasia, c.razao_social, c.account_type,
        c.ml_user_id, c.ml_expires_at,
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

    // 2. Pra cada empresa, busca vendas e processa
    for (const company of companies) {
      const cResult: any = {
        company_id: company.id,
        company_name: company.nome_fantasia || company.razao_social,
        account_nickname: company.account_nickname,
        ml_user_id: company.ml_user_id,
        fetched: 0,
        new_ids: 0,
        created: 0,
        errors: [] as string[],
        rate_limited: false,
        skipped: false,
      }

      // Verifica timeout global
      if (Date.now() - startTime > 280000) { // 4min40s
        cResult.skipped = true
        cResult.errors.push('Timeout: skipped por limite de tempo')
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

        // 3. Busca TODAS as vendas (paginação completa)
        const { ids: allIds, rateLimited } = await fetchAllMLOrderIds(
          company.ml_user_id,
          tokenInfo.token,
          days
        )
        cResult.fetched = allIds.length
        cResult.rate_limited = rateLimited

        if (allIds.length === 0) {
          results.push(cResult)
          continue
        }

        // 4. Quais JÁ existem no DB?
        const exist: any = await prisma.orders.findMany({
          where: { order_number: { in: allIds } },
          select: { order_number: true },
        })
        const existingSet = new Set(exist.map((e: any) => String(e.order_number)))
        const newIds = allIds.filter(id => !existingSet.has(id))
        cResult.new_ids = newIds.length

        if (newIds.length === 0) {
          results.push(cResult)
          continue
        }

        // 5. Limita a maxPerCompany vendas novas
        const idsToProcess = newIds.slice(0, maxPerCompany)
        cResult.capped = newIds.length > maxPerCompany

        // 6. Chama sync-orders-batch em chunks de 30
        let criados = 0
        for (let i = 0; i < idsToProcess.length; i += 25) {
          // Verifica timeout entre chunks
          if (Date.now() - startTime > 290000) {
            cResult.errors.push('Timeout: parou no meio do processamento')
            break
          }

          const chunk = idsToProcess.slice(i, i + 25)
          try {
            const r = await fetch(
              `${BASE_URL}/api/admin/sync-orders-batch?ids=${chunk.join(',')}&processExisting=false&account_id=${company.account_id}`,
              { headers: { Authorization: BASIC } }
            )
            const j = await r.json()
            criados += j.processed || 0
            if (j.rate_limited) cResult.rate_limited = true
            if (j.error_samples) cResult.errors.push(...j.error_samples.slice(0, 1))
          } catch (e: any) {
            cResult.errors.push(`chunk ${i}: ${e.message?.substring(0, 100)}`)
          }
          await sleep(300)
        }
        cResult.created = criados
      } catch (e: any) {
        cResult.errors.push(`Exceção: ${e.message?.substring(0, 150)}`)
      }

      results.push(cResult)
    }

    const totalCreated = results.reduce((sum: number, r: any) => sum + r.created, 0)
    const totalNew = results.reduce((sum: number, r: any) => sum + r.new_ids, 0)
    const totalErrors = results.reduce((sum: number, r: any) => sum + r.errors.length, 0)
    const duration = Math.round((Date.now() - startTime) / 1000)

    return NextResponse.json({
      ok: true,
      mode: 'sync-all-partners',
      days,
      max_per_company: maxPerCompany,
      companies_processed: results.length,
      total_new_ids: totalNew,
      total_created: totalCreated,
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
