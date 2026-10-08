/**
 * GET /api/admin/ml-listings
 * Lista TODOS os listings ativos da conta ML com nome do produto.
 *
 * AUTO-SYNC: se o banco não tiver listings, busca diretamente da API ML
 * e salva no banco antes de retornar (popula under sync).
 *
 * Query params:
 *   limit: número máximo (default 200)
 *   offset: paginação (default 0)
 *   search: busca por nome ou MLB
 *   has_scenario: "true" | "false" | "" (todos)
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isMatrizRequest } from '@/lib/admin-auth'
import { fetchWithRetry } from '@/lib/fetch-retry'

export const dynamic = 'force-dynamic'

// ── Auto-sync: busca listings diretamente da API ML e salva no banco ──
async function autoSyncFromML(accountId: string, accountIdMl: string, token: string): Promise<{ synced: number; errors: string[] }> {
  const errors: string[] = []
  let synced = 0

  try {
    // 1. Buscar todos os items do usuário via search API
    const allMlbs: string[] = []
    let offset = 0
    const searchLimit = 100

    while (true) {
      const searchRes = await fetchWithRetry<any>(
        `https://api.mercadolibre.com/users/${accountIdMl}/items/search?status=active&limit=${searchLimit}&offset=${offset}`,
        { headers: { Authorization: `Bearer ${token}` } },
        3, 2000
      )
      const results: string[] = searchRes?.results || []
      allMlbs.push(...results)
      if (!searchRes?.paging || results.length < searchLimit) break
      offset += searchLimit
      // Protecao: max 5000 listings
      if (allMlbs.length >= 5000) break
    }

    if (allMlbs.length === 0) {
      errors.push('Nenhum item encontrado na conta ML')
      return { synced: 0, errors }
    }

    // 2. Buscar detalhes dos items em chunks de 20 (limite ML por request)
    const chunkSize = 20
    for (let i = 0; i < allMlbs.length; i += chunkSize) {
      const chunk = allMlbs.slice(i, i + chunkSize)
      try {
        const detailRes = await fetchWithRetry<any>(
          `https://api.mercadolibre.com/items?ids=${chunk.join(',')}&attributes=id,title,price,status,available_quantity,thumbnail,seller_id`,
          { headers: { Authorization: `Bearer ${token}` } },
          2, 1500
        )
        const items: any[] = Array.isArray(detailRes) ? detailRes : (detailRes ? [detailRes] : [])
        for (const item of items) {
          if (!item?.id) continue
          try {
            await prisma.marketplace_listings.upsert({
              where: { id: `${accountId}-${item.id}` },
              create: {
                id: `${accountId}-${item.id}`,
                account_id: accountId,
                listing_id: item.id,
                status: item.status === 'active' ? 'active' : 'inactive',
                preco_atual: item.price != null ? item.price : null,
              },
              update: {
                status: item.status === 'active' ? 'active' : 'inactive',
                preco_atual: item.price != null ? item.price : null,
              },
            })
            synced++
          } catch (e: any) {
            errors.push(`Erro ao salvar MLB ${item.id}: ${e.message}`)
          }
        }
      } catch (e: any) {
        errors.push(`Erro chunk ${i}: ${e.message}`)
      }
    }

    return { synced, errors }
  } catch (e: any) {
    errors.push(`Sync ML falhou: ${e.message}`)
    return { synced: 0, errors }
  }
}

// ── GET ────────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  if (!isMatrizRequest(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  try {
    const { searchParams } = new URL(req.url)
    const limit = Math.min(parseInt(searchParams.get('limit') || '200', 10), 500)
    const offset = parseInt(searchParams.get('offset') || '0', 10)
    const search = searchParams.get('search') || ''
    const hasScenario = searchParams.get('has_scenario')

    // Buscar conta LIURAESSENCE
    const account = await prisma.marketplace_accounts.findFirst({
      where: { plataforma: 'mercado_livre', nickname: 'LIURAESSENCE' },
    })

    if (!account) {
      return NextResponse.json({ ok: false, error: 'Conta ML não encontrada. Verifique se a conta LIURAESSENCE está conectada em Configurações → Mercado Livre.' }, { status: 404 })
    }

    if (!account.access_token) {
      return NextResponse.json({
        ok: false,
        error: 'Conta sem token ML. O token pode estar expirado ou revogado.',
        hint: 'Vá em Configurações → Mercado Livre e reconecte a conta.',
        account_id: account.id,
        nickname: account.nickname,
      }, { status: 401 })
    }

    // ── AUTO-SYNC: se DB vazio, busca direto da API ML ──
    const dbCount = await prisma.marketplace_listings.count({
      where: { account_id: account.id, status: 'active' },
    })

    console.log(`[ml-listings] DB count for account ${account.id}: ${dbCount}`)

    let autoSyncResult: { synced: number; errors: string[] } | null = null

    if (dbCount === 0) {
      const userId = account.account_id || ''
      console.log(`[ml-listings] DB vazio. account_id (ML userId): "${userId}"`)
      if (userId) {
        console.log(`[ml-listings] Iniciando auto-sync do ML para userId: ${userId}`)
        autoSyncResult = await autoSyncFromML(account.id, userId, account.access_token)
        console.log(`[ml-listings] Auto-sync resultado: synced=${autoSyncResult.synced}, errors=${JSON.stringify(autoSyncResult.errors)}`)
      } else {
        // Não retornar erro — devolver lista vazia com warning
        console.warn(`[ml-listings] account.account_id está vazio para ${account.nickname}`)
        return NextResponse.json({
          ok: true,
          total: 0,
          total_in_db: 0,
          with_scenario: 0,
          without_scenario: 0,
          sync_error: 'Conta ML sem user_id. A conta pode não estar corretamente sincronizada com o Mercado Livre.',
          hint: 'Vá em Configurações → Mercado Livre e reconecte a conta LIURAESSENCE.',
          listings: [],
        })
      }
    }

    // Buscar cenários por MLB
    const scenarios = await prisma.promo_scenarios.findMany({
      select: {
        id: true,
        product_name: true,
        mlb: true,
        max_seller_discount_pct: true,
        min_sale_price: true,
        min_net_receivable: true,
        activation_mode: true,
        active: true,
        latest_query: { select: { fetched_at: true, normalized_data: true } },
        _count: { select: { simulations: true } },
      },
    })

    const scenarioMap = new Map<string, (typeof scenarios)[0]>()
    for (const s of scenarios) {
      if (s.mlb) scenarioMap.set(s.mlb, s)
    }

    // Buscar listings do banco
    const whereClause: any = {
      account_id: account.id,
      status: 'active',
    }
    if (search) {
      whereClause.AND = [
        {
          OR: [
            { listing_id: { contains: search, mode: 'insensitive' } },
            { products: { nome: { contains: search, mode: 'insensitive' } } },
          ],
        },
      ]
    }

    const listings: any[] = await prisma.marketplace_listings.findMany({
      where: whereClause,
      select: {
        listing_id: true,
        preco_atual: true,
        status: true,
        vendas_total: true,
        products: { select: { id: true, nome: true, sku: true } },
      },
      orderBy: { vendas_total: 'desc' },
      take: limit,
      skip: offset,
    })

    // Contar total
    const totalCount = await prisma.marketplace_listings.count({
      where: { account_id: account.id, status: 'active' },
    })

    // Separar com e sem cenário
    const withScenario: any[] = []
    const withoutScenario: any[] = []

    for (const l of listings) {
      if (!l.listing_id) continue
      const scenario = scenarioMap.get(l.listing_id)
      const item = {
        listing_id: l.listing_id,
        product_name: l.products?.nome || l.listing_id,
        preco_atual: l.preco_atual ? Number(l.preco_atual) : null,
        vendas_total: l.vendas_total,
        sku: l.products?.sku || null,
        has_scenario: !!scenario,
        scenario: scenario || null,
      }
      if (scenario) withScenario.push(item)
      else withoutScenario.push(item)
    }

    let result = [...withScenario, ...withoutScenario]
    if (hasScenario === 'true') result = withScenario
    if (hasScenario === 'false') result = withoutScenario

    // Se sync rodou mas não salvou nada, informar
    const syncError = autoSyncResult && autoSyncResult.synced === 0 && autoSyncResult.errors.length > 0
      ? autoSyncResult.errors[0]
      : null

    return NextResponse.json({
      ok: true,
      total: result.length,
      total_in_db: totalCount,
      with_scenario: withScenario.length,
      without_scenario: withoutScenario.length,
      auto_synced: autoSyncResult ? {
        listings_saved: autoSyncResult.synced,
        errors: autoSyncResult.errors,
      } : null,
      sync_error: syncError,
      listings: result,
    })
  } catch (err: any) {
    console.error('[ml-listings]', err)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
