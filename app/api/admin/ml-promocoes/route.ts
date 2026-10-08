/**
 * =====================================================
 * API: Promoções Reais do Mercado Livre
 * =====================================================
 * GET /api/admin/ml-promocoes?mlb=X
 *   → Busca TODAS as promoções de UM MLB específico via API ML
 *   → GET /api/admin/ml-promocoes/all?limit=N
 *   → Busca promoções de TODOS os listings ativos da conta
 * =====================================================
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { fetchWithRetry } from '@/lib/fetch-retry'

export const dynamic = 'force-dynamic'

// ── Normalização de promoção ML → formato padrão ──────────────────────────────
interface NormalizedPromo {
  promotion_id: string
  promotion_name: string
  promotion_type: string
  status: string
  start_date: string | null
  finish_date: string | null
  original_price: number
  discounted_price: number | null
  discount_percent: number | null
  discount_amount: number | null
  // SMART (seller + ML compartilham)
  seller_percentage: number | null
  meli_percentage: number | null
  // FLEXIBLE_PERCENTAGE (seller varia na faixa)
  min_discount_percent: number | null
  max_discount_percent: number | null
  suggested_discounted_price: number | null
  min_discounted_price: number | null
  max_discounted_price: number | null
  // Cupom / Pix cumulativo
  has_coupon: boolean
  has_pix_discount: boolean
  coupon_rate: number | null
  // Benefícios cumulativos
  free_shipping: boolean
  // Status de participação
  already_participating: boolean
}

function normalizePromo(p: any, originalPrice: number, status: string): NormalizedPromo {
  const type = p.type || p.promotion_type || 'UNKNOWN'

  // SMART: percentuais explícitos
  const sellerPct = p.seller_percentage != null ? Number(p.seller_percentage) : null
  const meliPct = p.meli_percentage != null ? Number(p.meli_percentage) : null

  // FLEXIBLE_PERCENTAGE: derivado de preços
  let minDiscountPct = null, maxDiscountPct = null
  let minDiscountedPrice = null, maxDiscountedPrice = null, suggestedDiscountedPrice = null
  if (p.max_discounted_price != null && originalPrice > 0) {
    maxDiscountPct = Math.round(((originalPrice - Number(p.max_discounted_price)) / originalPrice) * 10000) / 100
    maxDiscountedPrice = Number(p.max_discounted_price)
  }
  if (p.min_discounted_price != null && originalPrice > 0) {
    minDiscountPct = Math.round(((originalPrice - Number(p.min_discounted_price)) / originalPrice) * 10000) / 100
    minDiscountedPrice = Number(p.min_discounted_price)
  }
  if (p.suggested_discounted_price != null) {
    suggestedDiscountedPrice = Number(p.suggested_discounted_price)
  }

  // Cupom cumulativo: detecta se tem coupon no name ou type
  const hasCoupon = !!(p.coupon || (p.name && /cupom|desconto\s+exclusiv/i.test(p.name)) || type === 'COUPON')
  const couponRate = p.coupon_rate != null ? Number(p.coupon_rate) : (hasCoupon ? null : null)

  // Pix
  const hasPix = !!(p.pix || (p.name && /pix/i.test(p.name)) || type === 'PIX')

  return {
    promotion_id: p.id || '',
    promotion_name: p.name || `Promoção ${p.id || 's/tipo'}`,
    promotion_type: type,
    status,
    start_date: p.start_date || null,
    finish_date: p.finish_date || null,
    original_price: originalPrice,
    discounted_price: p.price != null ? Number(p.price) : null,
    discount_percent: p.discount_percent != null ? Number(p.discount_percent) : null,
    discount_amount: p.discount_amount != null ? Number(p.discount_amount) : null,
    seller_percentage: sellerPct,
    meli_percentage: meliPct,
    min_discount_percent: minDiscountPct,
    max_discount_percent: maxDiscountPct,
    suggested_discounted_price: suggestedDiscountedPrice,
    min_discounted_price: minDiscountedPrice,
    max_discounted_price: maxDiscountedPrice,
    has_coupon: hasCoupon,
    has_pix_discount: hasPix,
    coupon_rate: couponRate,
    free_shipping: !!(p.free_shipping || p.shipping === 'free'),
    already_participating: status === 'started',
  }
}

// ── Busca promoções de UM MLB via API ML ──────────────────────────────────────
async function fetchPromotionsForMLB(mlb: string, token: string): Promise<{ promotions: NormalizedPromo[], error?: string }> {
  try {
    const mlRes = await fetchWithRetry<any>(
      `https://api.mercadolibre.com/seller-promotions/items/${mlb}?app_version=v2`,
      { headers: { Authorization: `Bearer ${token}` } },
      3, 2000
    )

    if (!mlRes) return { promotions: [], error: 'ML retornou resposta vazia' }

    // O endpoint pode retornar { promotions: [...] } ou { results: [...] }
    const promotions: any[] = mlRes.promotions || mlRes.results || []
    if (promotions.length === 0) return { promotions: [] }

    const normalized: NormalizedPromo[] = []

    for (const promo of promotions) {
      // status da promoção: "candidate" = disponível para aderir, "started" = já participa
      const promoStatus = promo.status || 'candidate'

      // Para FLEXIBLE_PERCENTAGE: buscar preço original do item
      let originalPrice = promo.original_price || promo.price || 0
      if (!originalPrice && mlb) {
        try {
          const itemRes = await fetchWithRetry<any>(
            `https://api.mercadolibre.com/items/${mlb}`,
            { headers: { Authorization: `Bearer ${token}` } },
            1, 1000
          )
          if (itemRes?.price) {
            originalPrice = Number(itemRes.price)
          }
        } catch { /* usa price do promo */ }
      }

      normalized.push(normalizePromo(promo, originalPrice, promoStatus))
    }

    return { promotions: normalized }
  } catch (e: any) {
    return { promotions: [], error: e?.message || 'Erro ao buscar promoções ML' }
  }
}

// ── GET /api/admin/ml-promocoes?mlb=X — promoções de UM MLB ─────────────────
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const mlbParam = searchParams.get('mlb')
    const allParam = searchParams.get('all')
    const limitParam = searchParams.get('limit')

    // Buscar conta LIURAESSENCE
    const account = await prisma.marketplace_accounts.findFirst({
      where: { plataforma: 'mercado_livre', nickname: 'LIURAESSENCE' },
    })

    if (!account) {
      console.error('[ml-promocoes] Conta LIURAESSENCE não encontrada no DB')
      return NextResponse.json({ ok: false, error: 'Conta não encontrada no DB' }, { status: 404 })
    }
    if (!account.access_token) {
      console.error('[ml-promocoes] Conta LIURAESSENCE sem access_token')
      return NextResponse.json({ ok: false, error: 'Conta sem token ML. Conecte a conta em Configurações.' }, { status: 401 })
    }

    // ── Modo: TODOS os listings ────────────────────────────────────────────
    if (allParam === 'true') {
      const limit = parseInt(limitParam || '50', 10)

      // Buscar TODOS os listings ativos da conta (não filtrar por promo!)
      const listings = await prisma.marketplace_listings.findMany({
        where: {
          account_id: account.id,
          status: 'active',
        },
        select: {
          listing_id: true,
          preco_atual: true,
          products: { select: { nome: true } },
        },
        take: limit,
        orderBy: { vendas_total: 'desc' },
      })

      const allPromos: any[] = []
      const errors: string[] = []
      let fetched = 0

      // Fetch promoções em paralelo (até 5 por vez pra não estourar rate limit)
      const chunkSize = 5
      for (let i = 0; i < listings.length; i += chunkSize) {
        const chunk = listings.slice(i, i + chunkSize)
        const results = await Promise.all(
          chunk.map(async (l) => {
            if (!l.listing_id) return null
            const { promotions, error } = await fetchPromotionsForMLB(l.listing_id, account.access_token!)
            if (error) errors.push(`${l.listing_id}: ${error}`)
            fetched++
            return { listing: l, promotions }
          })
        )
        for (const r of results) {
          if (!r) continue
          for (const promo of r.promotions) {
            allPromos.push({
              ...promo,
              listing_id: r.listing.listing_id,
              product_name: r.listing.products?.nome || r.listing.listing_id,
              original_price: r.listing.preco_atual || promo.original_price,
            })
          }
        }
      }

      return NextResponse.json({
        ok: true,
        mode: 'all_listings',
        total_listings_consulted: fetched,
        total_promotions: allPromos.length,
        promotions: allPromos,
        errors: errors.length > 0 ? errors : undefined,
      })
    }

    // ── Modo: MLB específico ───────────────────────────────────────────────
    if (!mlbParam) {
      return NextResponse.json({ ok: false, error: 'Parâmetro mlb é obrigatório' }, { status: 400 })
    }

    const { promotions, error } = await fetchPromotionsForMLB(mlbParam, account.access_token)

    // Buscar info do listing
    const listing = await prisma.marketplace_listings.findFirst({
      where: { listing_id: mlbParam, account_id: account.id },
      select: { preco_atual: true, products: { select: { nome: true } } },
    })

    return NextResponse.json({
      ok: true,
      mode: 'single_mlb',
      mlb: mlbParam,
      promotions,
      product_name: listing?.products?.nome || null,
      original_price: listing?.preco_atual || null,
      error: error || undefined,
    })
  } catch (err: any) {
    console.error('[ml-promocoes]', err)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
