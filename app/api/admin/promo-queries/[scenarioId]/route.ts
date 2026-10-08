/**
 * POST /api/admin/promo-queries/[scenarioId]
 * Busca promoções do ML para o MLB do cenário,
 * normaliza, classifica e salva.
 */
import { NextRequest, NextResponse } from 'next/server'
import { isMatrizRequest } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'
import type { PrismaClient } from '@prisma/client'

export const dynamic = 'force-dynamic'

const ML_API = 'https://api.mercadolibre.com'
const ML_TOKEN_URL = 'https://api.mercadolibre.com/oauth/token'

// ─── Normalização ─────────────────────────────────────────────────────────────
function normalizePromotion(raw: any): any {
  const p: any = {
    promotion_id: raw.id || raw.promotion_id,
    promotion_type: raw.type || raw.promotion_type,
    name: raw.name || raw.campaign_name || null,
    status: raw.status,
    start_date: raw.start_date || null,
    finish_date: raw.finish_date || null,
    original_price: raw.original_price ? parseFloat(raw.original_price) : null,
    current_price: raw.price || raw.current_price ? parseFloat(raw.price || raw.current_price) : null,
    min_allowed_price: raw.min_discounted_price ? parseFloat(raw.min_discounted_price) : null,
    max_allowed_price: raw.max_discounted_price ? parseFloat(raw.max_discounted_price) : null,
    suggested_price: raw.suggested_discounted_price ? parseFloat(raw.suggested_discounted_price) : null,
    fixed_seller_pct: null,
    min_seller_pct: null,
    max_seller_pct: null,
    selected_seller_pct: null,
    meli_pct: null,
    total_discount_pct: null,
    simulated_sale_price: null,
    net_receivable: null,
    pix_cumulative_detected: false,
    coupon_cumulative_detected: false,
    cumulative_effect_known: false,
    raw_candidate: raw,
    missing_fields: [],
  }

  const type = p.promotion_type?.toUpperCase() || ''

  if (type === 'SMART') {
    // Desconto fixo: seller + ML explicitados
    p.fixed_seller_pct = raw.seller_percentage ? parseFloat(raw.seller_percentage) : null
    p.meli_pct = raw.meli_percentage ? parseFloat(raw.meli_percentage) : null
    p.selected_seller_pct = p.fixed_seller_pct
    p.total_discount_pct = (p.fixed_seller_pct || 0) + (p.meli_pct || 0)
    if (p.original_price) {
      p.simulated_sale_price = p.original_price * (1 - (p.total_discount_pct || 0) / 100)
    }
  } else if (['SELLER_CAMPAIGN', 'FLEXIBLE_PERCENTAGE'].includes(type)) {
    // Desconto variável: faixas de preço, não percentuais
    if (raw.status === 'candidate') {
      if (p.original_price && p.max_allowed_price) {
        p.min_seller_pct = parseFloat(((1 - p.max_allowed_price / p.original_price) * 100).toFixed(4))
      }
      if (p.original_price && p.min_allowed_price) {
        p.max_seller_pct = parseFloat(((1 - p.min_allowed_price / p.original_price) * 100).toFixed(4))
      }
      // selected_seller_pct fica null — decidido pelo modo na classificação
    } else if (raw.status === 'started') {
      // Promoção ativa: preço fixo
      p.simulated_sale_price = p.current_price
      if (p.original_price && p.current_price) {
        p.total_discount_pct = parseFloat(((1 - p.current_price / p.original_price) * 100).toFixed(4))
      }
    }
  } else {
    // Tipo desconhecido — marcar tudo como missing
    p.missing_fields.push('tipo_desconhecido:' + type)
    p.promotion_type = 'UNKNOWN:' + type
  }

  return p
}

// ─── Classificação ──────────────────────────────────────────────────────────────
function classifyPromotion(p: any, scenario: any, mode: string): any {
  const reasons: string[] = []
  const missing: string[] = [...(p.missing_fields || [])]
  let canJoin = true

  // Se já participa
  if (p.status === 'started' || p.status === 'programmed') {
    return { ...p, classification: 'already_participating', reasons: ['Já participa desta promoção'], missing: [], seller_pct: p.selected_seller_pct }
  }

  // Tipo desconhecido
  if (p.promotion_type?.startsWith('UNKNOWN:')) {
    return { ...p, classification: 'inconclusive', reasons: ['Tipo de promoção não reconhecido: ' + p.promotion_type], missing: missing.filter(Boolean) }
  }

  // Se não tem seller_pct definido e é promoção variável
  const isVariable = ['SELLER_CAMPAIGN', 'FLEXIBLE_PERCENTAGE'].includes(p.promotion_type?.toUpperCase() || '')
  if (isVariable && p.selected_seller_pct === null) {
    const minPct = p.min_seller_pct ?? 0
    const maxPct = p.max_seller_pct ?? 100

    if (mode === 'conservative') {
      p.selected_seller_pct = minPct
    } else {
      // Agressivo: maior contribuição que respeite todos os critérios
      p.selected_seller_pct = maxPct
    }
  }

  // Critério 1: teto de desconto do seller
  if (scenario.max_seller_discount_pct && p.selected_seller_pct !== null) {
    if (p.selected_seller_pct > Number(scenario.max_seller_discount_pct)) {
      canJoin = false
      reasons.push(`Seller ${p.selected_seller_pct.toFixed(2)}% > teto ${scenario.max_seller_discount_pct}%`)
    } else {
      reasons.push(`Teto seller: ✓`)
    }
  } else if (scenario.max_seller_discount_pct && p.selected_seller_pct === null) {
    missing.push('seller_pct')
  }

  // Calcular preço simulado se possível
  if (p.original_price && p.selected_seller_pct !== null) {
    const type = p.promotion_type?.toUpperCase() || ''
    if (type === 'SMART') {
      p.simulated_sale_price = parseFloat((p.original_price * (1 - (p.selected_seller_pct + (p.meli_pct || 0)) / 100)).toFixed(2))
    } else if (isVariable && p.status === 'candidate' && p.selected_seller_pct !== null) {
      p.simulated_sale_price = parseFloat((p.original_price * (1 - p.selected_seller_pct / 100)).toFixed(2))
    }
  }

  // Critério 2: preço mínimo de venda
  if (scenario.min_sale_price && p.simulated_sale_price !== null) {
    if (p.simulated_sale_price < Number(scenario.min_sale_price)) {
      canJoin = false
      reasons.push(`Preço R$ ${p.simulated_sale_price} < mínimo R$ ${scenario.min_sale_price}`)
    } else {
      reasons.push(`Preço mínimo: ✓`)
    }
  } else if (scenario.min_sale_price && p.simulated_sale_price === null) {
    missing.push('simulated_sale_price')
  }

  // Critério 3: recebimento mínimo (sem cálculo próprio — marca inconclusivo)
  if (scenario.min_net_receivable && !p.net_receivable) {
    missing.push('net_receivable')
  }
  if (scenario.min_net_receivable && p.net_receivable !== null) {
    if (p.net_receivable < Number(scenario.min_net_receivable)) {
      canJoin = false
      reasons.push(`Recebimento R$ ${p.net_receivable} < mínimo R$ ${scenario.min_net_receivable}`)
    } else {
      reasons.push(`Recebimento mínimo: ✓`)
    }
  }

  // Agressivo: se não passou, tentar reduzir seller_pct para caber nos critérios
  if (!canJoin && isVariable && mode === 'aggressive' && p.original_price) {
    let bestPct = p.selected_seller_pct || 0
    for (let testPct = bestPct; testPct >= (p.min_seller_pct || 0); testPct -= 0.5) {
      const testPrice = parseFloat((p.original_price * (1 - testPct / 100)).toFixed(2))
      const priceOk = !scenario.min_sale_price || testPrice >= Number(scenario.min_sale_price)
      const sellerOk = !scenario.max_seller_discount_pct || testPct <= Number(scenario.max_seller_discount_pct)
      if (priceOk && sellerOk) {
        p.selected_seller_pct = parseFloat(testPct.toFixed(4))
        p.simulated_sale_price = testPrice
        canJoin = true
        reasons.push(`Ajustado para seller ${testPct.toFixed(2)}%: todos os critérios respeitados`)
        break
      }
    }
    if (!canJoin) {
      reasons.push('Nenhum valor de seller respeita todos os critérios')
    }
  }

  if (missing.length > 0 && canJoin) {
    return { ...p, classification: 'inconclusive', reasons, missing }
  }

  return { ...p, classification: canJoin ? 'can_join' : 'cannot_join', reasons }
}

// ─── Obter token válido ──────────────────────────────────────────────────────
async function getValidToken(prisma: PrismaClient): Promise<{ token: string; ml_user_id: string; nickname: string } | null> {
  const account = await prisma.marketplace_accounts.findFirst({
    where: { plataforma: 'mercado_livre', ativa: true },
    orderBy: { created_at: 'desc' },
  })
  if (!account?.access_token) return null

  // Verificar se expirou
  if (account.token_expira_em && new Date(account.token_expira_em) < new Date()) {
    // Tentar refresh
    if (!process.env.ML_CLIENT_ID || !process.env.ML_CLIENT_SECRET) return null
    try {
      const refreshRes = await fetch(ML_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: process.env.ML_CLIENT_ID,
          client_secret: process.env.ML_CLIENT_SECRET!,
          refresh_token: account.refresh_token || '',
        }),
      })
      if (!refreshRes.ok) return null
      const newToken: any = await refreshRes.json()
      const expiresAt = new Date(Date.now() + newToken.expires_in * 1000)
      await prisma.marketplace_accounts.update({
        where: { id: account.id },
        data: { access_token: newToken.access_token, refresh_token: newToken.refresh_token, token_expira_em: expiresAt },
      })
      return { token: newToken.access_token, ml_user_id: String(account.account_id), nickname: account.nickname || '' }
    } catch {
      return null
    }
  }

  return { token: account.access_token, ml_user_id: String(account.account_id), nickname: account.nickname || '' }
}

// ─── Handler ──────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest, { params }: { params: { scenarioId: string } }) {
  if (!isMatrizRequest(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  try {
    const scenario = await prisma.promo_scenarios.findUnique({ where: { id: params.scenarioId } })
    if (!scenario) return NextResponse.json({ ok: false, error: 'Cenário não encontrado' }, { status: 404 })
    if (!scenario.active) return NextResponse.json({ ok: false, error: 'Cenário está inativo. Ative-o antes de buscar promoções.' }, { status: 400 })
    if (!scenario.mlb) return NextResponse.json({ ok: false, error: 'MLB não definido neste cenário.' }, { status: 400 })

    const mlAuth = await getValidToken(prisma)
    if (!mlAuth) return NextResponse.json({ ok: false, error: 'Conta Mercado Livre não conectada ou token expirado. Conecte em Configurações > Mercado Livre.' }, { status: 400 })

    // Buscar promoções na API do ML
    const promoRes = await fetch(`${ML_API}/seller-promotions/items/${scenario.mlb}?app_version=v2`, {
      headers: { Authorization: `Bearer ${mlAuth.token}` },
    })

    if (!promoRes.ok) {
      const errText = await promoRes.text()
      return NextResponse.json({ ok: false, error: `Erro ML: ${promoRes.status} ${errText}` }, { status: 502 })
    }

    const mlData: any = await promoRes.json()
    const rawPromotions: any[] = Array.isArray(mlData) ? mlData : mlData.promotions || mlData.items || []

    // Normalizar
    const normalized = rawPromotions.map(normalizePromotion)

    // Classificar cada promoção
    const classified = normalized.map(p => classifyPromotion(p, scenario, scenario.activation_mode))

    // Salvar/atualizar última consulta
    await prisma.promo_latest_queries.upsert({
      where: { scenario_id: params.scenarioId },
      create: {
        scenario_id: params.scenarioId,
        ml_user_id: mlAuth.ml_user_id,
        mlb_at_query: scenario.mlb,
        raw_payload: rawPromotions,
        normalized_data: classified,
      },
      update: {
        ml_user_id: mlAuth.ml_user_id,
        mlb_at_query: scenario.mlb,
        raw_payload: rawPromotions,
        normalized_data: classified,
      },
    })

    return NextResponse.json({
      ok: true,
      promotions: classified,
      fetched_at: new Date().toISOString(),
      ml: { ml_user_id: mlAuth.ml_user_id, nickname: mlAuth.nickname },
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

export async function GET(req: NextRequest, { params }: { params: { scenarioId: string } }) {
  if (!isMatrizRequest(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  try {
    const query = await prisma.promo_latest_queries.findUnique({
      where: { scenario_id: params.scenarioId },
    })
    if (!query) return NextResponse.json({ ok: false, error: 'Nenhuma consulta salva para este cenário.' }, { status: 404 })

    return NextResponse.json({
      ok: true,
      promotions: query.normalized_data,
      fetched_at: query.fetched_at,
      mlb_at_query: query.mlb_at_query,
      ml_user_id: query.ml_user_id,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
