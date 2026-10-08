/**
 * GET /api/admin/ml-sync-trigger
 * Força a sincronização dos listings da conta LIURAESSENCE diretamente
 * da API do Mercado Livre e retorna diagnóstico detalhado.
 *
 * Útil quando o banco está vazio e o auto-sync precisa de debug.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isMatrizRequest } from '@/lib/admin-auth'
import { fetchWithRetry } from '@/lib/fetch-retry'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!isMatrizRequest(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // 1. Buscar conta
    const account = await prisma.marketplace_accounts.findFirst({
      where: { plataforma: 'mercado_livre', nickname: 'LIURAESSENCE' },
    })

    if (!account) {
      return NextResponse.json({
        ok: false,
        step: 'account_lookup',
        error: 'Conta LIURAESSENCE não encontrada no banco de dados.',
        hint: 'Conecte a conta ML em Configurações → Mercado Livre.',
      }, { status: 404 })
    }

    const result: any = {
      ok: true,
      account: {
        id: account.id,
        nickname: account.nickname,
        company_id: account.company_id,
        ml_user_id: account.account_id,
        has_token: !!account.access_token,
        token_preview: account.access_token ? account.access_token.substring(0, 15) + '...' : null,
      },
    }

    // 2. Status atual do banco
    const dbCount = await prisma.marketplace_listings.count({
      where: { account_id: account.id, status: 'active' },
    })
    result.db_status = {
      active_listings: dbCount,
      needs_sync: dbCount === 0,
    }

    if (!account.access_token) {
      result.ok = false
      result.step = 'token'
      result.error = 'Conta sem access_token. O token pode estar expirado ou revogado.'
      result.hint = 'Vá em Configurações → Mercado Livre e reconecte a conta LIURAESSENCE.'
      return NextResponse.json(result, { status: 401 })
    }

    if (!account.account_id) {
      result.ok = false
      result.step = 'ml_user_id'
      result.error = 'Conta sem account_id (ML user ID). A conta pode não estar sincronizada.'
      result.hint = 'Vá em Configurações → Mercado Livre e reconecte a conta LIURAESSENCE.'
      return NextResponse.json(result, { status: 400 })
    }

    // 3. Testar API de busca do ML
    result.ml_api_test = {}
    try {
      const searchRes = await fetchWithRetry<any>(
        `https://api.mercadolibre.com/users/${account.account_id}/items/search?status=active&limit=5`,
        { headers: { Authorization: `Bearer ${account.access_token}` } },
        2, 3000
      )
      result.ml_api_test.search = {
        ok: true,
        total_in_ml: searchRes?.paging?.total || searchRes?.results?.length || 0,
        returned: searchRes?.results?.length || 0,
        first_3_mlbs: (searchRes?.results || []).slice(0, 3),
        raw_keys: searchRes ? Object.keys(searchRes).filter(k => !k.startsWith('_')) : [],
      }
    } catch (e: any) {
      result.ml_api_test.search = { ok: false, error: e.message }
      result.ok = false
      result.step = 'ml_search_api'
      result.error = `Erro ao buscar itens no ML: ${e.message}`
      return NextResponse.json(result, { status: 502 })
    }

    // 4. Se DB vazio, fazer sync completo
    if (dbCount === 0) {
      result.sync = { running: true }
      const allMlbs: string[] = []
      let offset = 0
      const searchLimit = 100

      try {
        while (true) {
          const searchRes = await fetchWithRetry<any>(
            `https://api.mercadolibre.com/users/${account.account_id}/items/search?status=active&limit=${searchLimit}&offset=${offset}`,
            { headers: { Authorization: `Bearer ${account.access_token}` } },
            3, 2000
          )
          const results: string[] = searchRes?.results || []
          allMlbs.push(...results)
          if (!searchRes?.paging || results.length < searchLimit) break
          offset += searchLimit
          if (allMlbs.length >= 5000) break
        }
      } catch (e: any) {
        result.sync = { error: e.message }
        result.ok = false
        result.step = 'sync_pagination'
        result.error = `Erro na paginação: ${e.message}`
        return NextResponse.json(result)
      }

      result.sync.ml_total_found = allMlbs.length

      if (allMlbs.length === 0) {
        result.sync.saved = 0
        result.ok = false
        result.step = 'no_results'
        result.error = 'Nenhum item ativo encontrado na conta ML. Verifique se a conta tem anúncios publicados.'
        return NextResponse.json(result)
      }

      // Buscar detalhes e salvar
      const chunkSize = 20
      let saved = 0
      const errors: string[] = []

      for (let i = 0; i < allMlbs.length; i += chunkSize) {
        const chunk = allMlbs.slice(i, i + chunkSize)
        try {
          const detailRes = await fetchWithRetry<any>(
            `https://api.mercadolibre.com/items?ids=${chunk.join(',')}&attributes=id,title,price,status,available_quantity,thumbnail,seller_id`,
            { headers: { Authorization: `Bearer ${account.access_token}` } },
            2, 1500
          )
          const items: any[] = Array.isArray(detailRes) ? detailRes : (detailRes ? [detailRes] : [])
          for (const item of items) {
            if (!item?.id) continue
            try {
              await prisma.marketplace_listings.upsert({
                where: { id: `${account.id}-${item.id}` },
                create: {
                  id: `${account.id}-${item.id}`,
                  account_id: account.id,
                  listing_id: item.id,
                  status: item.status === 'active' ? 'active' : 'inactive',
                  preco_atual: item.price != null ? item.price : null,
                },
                update: {
                  status: item.status === 'active' ? 'active' : 'inactive',
                  preco_atual: item.price != null ? item.price : null,
                },
              })
              saved++
            } catch (e: any) {
              errors.push(`MLB ${item.id}: ${e.message}`)
            }
          }
        } catch (e: any) {
          errors.push(`Chunk ${i}: ${e.message}`)
        }
      }

      result.sync.saved = saved
      result.sync.errors = errors.slice(0, 5)

      // Verificar nova contagem
      const newCount = await prisma.marketplace_listings.count({
        where: { account_id: account.id, status: 'active' },
      })
      result.db_status.after_sync = newCount
    }

    return NextResponse.json(result)
  } catch (err: any) {
    console.error('[ml-sync-trigger]', err)
    return NextResponse.json({ ok: false, step: 'exception', error: err.message }, { status: 500 })
  }
}
