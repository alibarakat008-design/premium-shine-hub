/**
 * POST /api/admin/promo-scenarios/[id]/fetch-promotions
 * Busca promoções do ML para o cenário, classifica e salva.
 */
import { NextRequest, NextResponse } from 'next/server'
import { isMatrizRequest } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'
import { fetchWithRetry } from '@/lib/fetch-retry'

export const dynamic = 'force-dynamic'

// ── Util: obter token ML válido ──────────────────────────────────────────────
async function getMLToken(accountId: string): Promise<{ token: string; userId: string } | null> {
  const acc = await prisma.marketplace_accounts.findUnique({ where: { id: accountId } })
  if (!acc?.access_token) return null
  return { token: acc.access_token, userId: acc.account_id || '' }
}

// ── Util: fetch promoções de um MLB via API ML ───────────────────────────────
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
  seller_percentage: number | null
  meli_percentage: number | null
  min_discount_percent: number | null
  max_discount_percent: number | null
  suggested_discounted_price: number | null
  min_discounted_price: number | null
  max_discounted_price: number | null
  has_coupon: boolean
  has_pix_discount: boolean
  coupon_rate: number | null
  free_shipping: boolean
  already_participating: boolean
}

function normalizePromo(p: any, originalPrice: number): NormalizedPromo {
  const type = p.type || p.promotion_type || 'UNKNOWN'
  const promoStatus = p.status || 'candidate'
  const sellerPct = p.seller_percentage != null ? Number(p.seller_percentage) : null

  let minDiscountPct = null, maxDiscountPct = null
  let minDiscountedPrice = null, maxDiscountedPrice = null
  if (p.max_discounted_price != null && originalPrice > 0) {
    maxDiscountPct = Math.round(((originalPrice - Number(p.max_discounted_price)) / originalPrice) * 10000) / 100
    maxDiscountedPrice = Number(p.max_discounted_price)
  }
  if (p.min_discounted_price != null && originalPrice > 0) {
    minDiscountPct = Math.round(((originalPrice - Number(p.min_discounted_price)) / originalPrice) * 10000) / 100
    minDiscountedPrice = Number(p.min_discounted_price)
  }

  const hasCoupon = !!(p.coupon || (p.name && /cupom|desconto\s+exclusiv/i.test(p.name)))
  const hasPix = !!(p.name && /pix/i.test(p.name))

  return {
    promotion_id: p.id || '',
    promotion_name: p.name || `Promoção ${p.id || ''}`,
    promotion_type: type,
    status: promoStatus,
    start_date: p.start_date || null,
    finish_date: p.finish_date || null,
    original_price: originalPrice,
    discounted_price: p.price != null ? Number(p.price) : null,
    discount_percent: p.discount_percent != null ? Number(p.discount_percent) : null,
    seller_percentage: sellerPct,
    meli_percentage: p.meli_percentage != null ? Number(p.meli_percentage) : null,
    min_discount_percent: minDiscountPct,
    max_discount_percent: maxDiscountPct,
    suggested_discounted_price: p.suggested_discounted_price != null ? Number(p.suggested_discounted_price) : null,
    min_discounted_price: minDiscountedPrice,
    max_discounted_price: maxDiscountedPrice,
    has_coupon: hasCoupon,
    has_pix_discount: hasPix,
    coupon_rate: null,
    free_shipping: !!(p.free_shipping),
    already_participating: promoStatus === 'started',
  }
}

// ── Util: buscar preço original do item ──────────────────────────────────────
async function getItemOriginalPrice(mlb: string, token: string): Promise<number | null> {
  try {
    const item = await fetchWithRetry<any>(
      `https://api.mercadolibre.com/items/${mlb}`,
      { headers: { Authorization: `Bearer ${token}` } },
      1, 1000
    )
    return item?.price != null ? Number(item.price) : null
  } catch { return null }
}

// ── Util: buscar tarifa de venda ─────────────────────────────────────────────
async function getSaleFee(price: number, listingTypeId: string, categoryId: string): Promise<number | null> {
  try {
    const res = await fetchWithRetry<any>(
      `https://api.mercadolibre.com/sites/MLB/listing_prices?price=${price}&listing_type_id=${listingTypeId}&category_id=${categoryId}`,
      { headers: { Authorization: `Bearer ${process.env.ML_API_TOKEN || ''}` } },
      1, 1000
    )
    return res?.sale_fee_amount != null ? Number(res.sale_fee_amount) : null
  } catch { return null }
}

// ── Util: buscar custo frete grátis ─────────────────────────────────────────
async function getFreeShippingCost(mlb: string): Promise<number | null> {
  try {
    const res = await fetchWithRetry<any>(
      `https://api.mercadolibre.com/items/${mlb}/shipping_options?zip_code=01310100`,
      {},
      1, 1000
    )
    const recommended = res?.options?.find((o: any) => o.display === 'recommended')
    return recommended?.cost != null ? Number(recommended.cost) : null
  } catch { return null }
}

// ── Util: classificar uma promoção ────────────────────────────────────────────
interface ClassifiedPromo extends NormalizedPromo {
  classification: 'can_join' | 'cannot_join' | 'inconclusive' | 'already_participating'
  classification_reasons: string[]
  missing_fields: string[]
  seller_pct_used: number | null
  simulated_price: number | null
  simulated_net_receivable: number | null
}

function classifyPromo(
  promo: NormalizedPromo,
  scenario: {
    max_seller_discount_pct: number | null
    min_sale_price: number | null
    min_net_receivable: number | null
    activation_mode: string
  },
  saleFee: number | null,
  freeShippingCost: number | null
): ClassifiedPromo {
  const reasons: string[] = []
  const missing: string[] = []

  // Já participa → não avaliar
  if (promo.already_participating) {
    return {
      ...promo,
      classification: 'already_participating',
      classification_reasons: ['Já participa desta promoção'],
      missing_fields: [],
      seller_pct_used: promo.seller_percentage,
      simulated_price: promo.discounted_price,
      simulated_net_receivable: null,
    }
  }

  const mode = scenario.activation_mode || 'conservative'
  const price = promo.discounted_price || promo.original_price

  // ── Determinar seller_pct_used ──
  let sellerPctUsed: number | null = null

  if (promo.seller_percentage !== null) {
    // SMART: seller_pct explícito
    sellerPctUsed = promo.seller_percentage
  } else if (promo.min_discount_percent !== null && promo.max_discount_percent !== null) {
    // FLEXIBLE: escolher dentro da faixa
    if (mode === 'conservative') {
      // Menor desconto = maior preço final = maior recebimento
      sellerPctUsed = promo.min_discount_percent
    } else {
      // Agressivo: maior desconto = maior chance de se destacar
      // Mas respeitando o teto do cenário
      const teto = scenario.max_seller_discount_pct
      if (teto !== null && teto < promo.max_discount_percent) {
        sellerPctUsed = Math.max(promo.min_discount_percent, teto)
      } else {
        sellerPctUsed = promo.max_discount_percent
      }
    }
  }

  // ── Verificar teto de desconto ──
  if (scenario.max_seller_discount_pct !== null && sellerPctUsed !== null) {
    if (sellerPctUsed > scenario.max_seller_discount_pct) {
      reasons.push(`Teto seller ${scenario.max_seller_discount_pct}% violado (seller cederia ${sellerPctUsed}%)`)
    }
  }

  // ── Verificar preço mínimo ──
  const simPrice = promo.discounted_price || (sellerPctUsed !== null && promo.original_price > 0
    ? promo.original_price * (1 - sellerPctUsed / 100)
    : null)

  if (scenario.min_sale_price !== null && simPrice !== null) {
    if (simPrice < Number(scenario.min_sale_price)) {
      reasons.push(`Preço mínimo R$ ${Number(scenario.min_sale_price).toFixed(2)} violado (preço simulado R$ ${simPrice.toFixed(2)})`)
    }
  }

  // ── Verificar recebimento mínimo ──
  let netReceivable: number | null = null
  if (simPrice !== null && saleFee !== null) {
    netReceivable = simPrice - saleFee - (freeShippingCost || 0)
  } else if (simPrice !== null) {
    missing.push('sale_fee')
  }

  if (scenario.min_net_receivable !== null && netReceivable !== null) {
    if (netReceivable < Number(scenario.min_net_receivable)) {
      reasons.push(`Recebimento mínimo R$ ${Number(scenario.min_net_receivable).toFixed(2)} violado (líquido R$ ${netReceivable.toFixed(2)})`)
    }
  } else if (scenario.min_net_receivable !== null && saleFee === null) {
    missing.push('sale_fee')
  }

  // ── Classificar ──
  let classification: ClassifiedPromo['classification']
  if (missing.length > 0) {
    classification = 'inconclusive'
    reasons.push('Dados insuficientes para decisão completa')
  } else if (reasons.length === 0) {
    classification = 'can_join'
    reasons.push('Todos os critérios respeitados')
  } else {
    classification = 'cannot_join'
  }

  return {
    ...promo,
    classification,
    classification_reasons: reasons,
    missing_fields: missing,
    seller_pct_used: sellerPctUsed,
    simulated_price: simPrice,
    simulated_net_receivable: netReceivable,
  }
}

// ── POST ─────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isMatrizRequest(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  try {
    // 1. Carregar cenário
    const scenario = await prisma.promo_scenarios.findUnique({ where: { id: params.id } })
    if (!scenario) return NextResponse.json({ ok: false, error: 'Cenário não encontrado' }, { status: 404 })

    if (!scenario.active) {
      return NextResponse.json({ ok: false, error: 'Cenário está inativo. Ative-o antes de buscar promoções.' }, { status: 400 })
    }

    if (!scenario.mlb) {
      return NextResponse.json({ ok: false, error: 'Cenário não tem MLB configurado.' }, { status: 400 })
    }

    // 2. Validar conta conectada
    const account = await prisma.marketplace_accounts.findFirst({
      where: { plataforma: 'mercado_livre', nickname: 'LIURAESSENCE' },
    })
    if (!account?.access_token) {
      return NextResponse.json({ ok: false, error: 'Conta ML não conectada. Vá em Configurações → Mercado Livre.' }, { status: 400 })
    }

    // 3. Obter preço original do item
    const originalPrice = await getItemOriginalPrice(scenario.mlb, account.access_token) || 0

    // 4. Buscar promoções do ML
    let mlPromotions: any[] = []
    try {
      const mlRes = await fetchWithRetry<any>(
        `https://api.mercadolibre.com/seller-promotions/items/${scenario.mlb}?app_version=v2`,
        { headers: { Authorization: `Bearer ${account.access_token}` } },
        2, 1500
      )
      mlPromotions = mlRes?.promotions || mlRes?.results || []
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: 'Erro ao consultar API ML: ' + (e?.message || 'desconhecido') }, { status: 500 })
    }

    // 5. Normalizar promoções
    const normalized: NormalizedPromo[] = mlPromotions.map(p => normalizePromo(p, originalPrice))

    // 6. Classificar cada promoção
    // Buscar tarifa de venda (precisa listing_type e category do item)
    let saleFee: number | null = null
    let freeShippingCost: number | null = null
    try {
      const item = await fetchWithRetry<any>(
        `https://api.mercadolibre.com/items/${scenario.mlb}`,
        { headers: { Authorization: `Bearer ${account.access_token}` } },
        1, 1000
      )
      if (item?.price && item?.listing_type_id && item?.category_id) {
        saleFee = await getSaleFee(Number(item.price), item.listing_type_id, item.category_id)
      }
      // Buscar custo frete
      freeShippingCost = await getFreeShippingCost(scenario.mlb)
    } catch { /* não crítico */ }

    const classified: ClassifiedPromo[] = normalized.map(p =>
      classifyPromo(p, {
        max_seller_discount_pct: scenario.max_seller_discount_pct ? Number(scenario.max_seller_discount_pct) : null,
        min_sale_price: scenario.min_sale_price ? Number(scenario.min_sale_price) : null,
        min_net_receivable: scenario.min_net_receivable ? Number(scenario.min_net_receivable) : null,
        activation_mode: scenario.activation_mode || 'conservative',
      }, saleFee, freeShippingCost)
    )

    // 7. Salvar em promo_latest_queries
    await prisma.promo_latest_queries.upsert({
      where: { scenario_id: params.id },
      create: {
        scenario_id: params.id,
        ml_user_id: account.account_id || null,
        mlb_at_query: scenario.mlb,
        raw_payload: mlPromotions as any,
        normalized_data: classified as any,
        fetched_at: new Date(),
      },
      update: {
        ml_user_id: account.account_id || null,
        mlb_at_query: scenario.mlb,
        raw_payload: mlPromotions as any,
        normalized_data: classified as any,
        fetched_at: new Date(),
      },
    })

    // 8. Registrar no histórico
    await prisma.promo_scenario_history.create({
      data: {
        scenario_id: params.id,
        event_type: 'query_executed',
        new_values: { promotions_found: classified.length, mlb: scenario.mlb },
      },
    })

    return NextResponse.json({
      ok: true,
      total: classified.length,
      promotions: classified,
      sale_fee_used: saleFee,
      free_shipping_cost_used: freeShippingCost,
      fetched_at: new Date().toISOString(),
    })
  } catch (err: any) {
    console.error('[fetch-promotions]', err)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
