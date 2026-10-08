/**
 * GET /api/admin/ml-promocoes-test
 * Endpoint de diagnóstico: testa a API do ML diretamente
 * e retorna o resultado cru pra debugging.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { fetchWithRetry } from '@/lib/fetch-retry'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    // 1. Testar conta
    const account = await prisma.marketplace_accounts.findFirst({
      where: { plataforma: 'mercado_livre', nickname: 'LIURAESSENCE' },
    })

    if (!account) {
      return NextResponse.json({ 
        ok: false, 
        step: 'account_lookup',
        error: 'Conta LIURAESSENCE não encontrada no DB' 
      }, { status: 404 })
    }

    if (!account.access_token) {
      return NextResponse.json({ 
        ok: false, 
        step: 'account_lookup',
        error: 'Conta sem access_token — token pode estar expirado ou revogado',
        account_id: account.id,
        nickname: account.nickname,
      }, { status: 401 })
    }

    // 2. Testar listings
    const listings = await prisma.marketplace_listings.findMany({
      where: { account_id: account.id, status: 'active' },
      select: { listing_id: true, preco_atual: true, products: { select: { nome: true } } },
      take: 5,
      orderBy: { vendas_total: 'desc' },
    })

    if (listings.length === 0) {
      return NextResponse.json({ 
        ok: false, 
        step: 'listings_lookup',
        error: 'Nenhum listing ativo encontrado para esta conta',
        account_id: account.id,
        listings_found: 0,
      }, { status: 404 })
    }

    // 3. Testar API ML com o PRIMEIRO listing
    const testListing = listings[0]
    const token = account.access_token
    const mlb = testListing.listing_id!

    console.log(`[ml-promocoes-test] Testando MLB ${mlb} com token (${token.substring(0, 20)}...)`)

    // Test A: GET /items/{MLB}
    let itemResult = null
    try {
      itemResult = await fetchWithRetry<any>(
        `https://api.mercadolibre.com/items/${mlb}`,
        { headers: { Authorization: `Bearer ${token}` } },
        1, 2000
      )
    } catch (e: any) {
      itemResult = { _error: e.message }
    }

    // Test B: GET /seller-promotions/items/{MLB}
    let promoResult = null
    try {
      promoResult = await fetchWithRetry<any>(
        `https://api.mercadolibre.com/seller-promotions/items/${mlb}?app_version=v2`,
        { headers: { Authorization: `Bearer ${token}` } },
        1, 2000
      )
    } catch (e: any) {
      promoResult = { _error: e.message }
    }

    const promotions = promoResult?.promotions || promoResult?.results || []
    const hasPromotions = promotions.length > 0

    return NextResponse.json({
      ok: true,
      step: 'ml_api_test',
      results: {
        account: {
          id: account.id,
          nickname: account.nickname,
          has_token: !!token,
          token_preview: token.substring(0, 15) + '...',
        },
        listings_found: listings.length,
        test_listing: {
          mlb,
          nome: testListing.products?.nome || testListing.listing_id,
          preco: testListing.preco_atual ? Number(testListing.preco_atual) : null,
        },
        item_api: {
          url: `https://api.mercadolibre.com/items/${mlb}`,
          success: !itemResult?._error,
          has_price: itemResult?.price != null,
          price: itemResult?.price,
          status: itemResult?.status,
          error: itemResult?._error || null,
        },
        promo_api: {
          url: `https://api.mercadolibre.com/seller-promotions/items/${mlb}?app_version=v2`,
          success: !promoResult?._error,
          raw_response_keys: promoResult ? Object.keys(promoResult).filter(k => !k.startsWith('_')) : [],
          promotions_count: promotions.length,
          promotions: hasPromotions ? promotions.map((p: any) => ({
            id: p.id,
            type: p.type,
            status: p.status,
            name: p.name,
          })) : [],
          error: promoResult?._error || null,
        },
        all_listings_sample: listings.slice(0, 3).map(l => ({
          mlb: l.listing_id,
          nome: l.products?.nome || l.listing_id,
        })),
      },
    })
  } catch (err: any) {
    console.error('[ml-promocoes-test]', err)
    return NextResponse.json({ ok: false, step: 'exception', error: err.message }, { status: 500 })
  }
}
