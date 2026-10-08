/**
 * POST /api/admin/promo-simulations
 * Cria uma simulação de adesão — NÃO adere de verdade.
 * O frontend mostra a simulação mas chama este endpoint para salvar no histórico.
 */
import { NextRequest, NextResponse } from 'next/server'
import { isMatrizRequest } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  if (!isMatrizRequest(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    const { scenario_id, promotion_id, promotion_type } = body

    if (!scenario_id || !promotion_id) {
      return NextResponse.json({ ok: false, error: 'scenario_id e promotion_id são obrigatórios.' }, { status: 400 })
    }

    // 1. Carregar cenário atual
    const scenario = await prisma.promo_scenarios.findUnique({ where: { id: scenario_id } })
    if (!scenario) return NextResponse.json({ ok: false, error: 'Cenário não encontrado' }, { status: 404 })

    // 2. Carregar última consulta
    const latestQuery = await prisma.promo_latest_queries.findUnique({ where: { scenario_id } })
    if (!latestQuery) return NextResponse.json({ ok: false, error: 'Nenhuma consulta salva. Busque as promoções primeiro.' }, { status: 400 })

    const promotions = (latestQuery.normalized_data || []) as any[]
    const promotion = promotions.find((p: any) =>
      p.promotion_id === promotion_id &&
      (!promotion_type || (p.promotion_type || '').toUpperCase() === (promotion_type || '').toUpperCase())
    )

    if (!promotion) return NextResponse.json({ ok: false, error: 'Promoção não encontrada na última consulta.' }, { status: 404 })

    if (promotion.classification !== 'can_join') {
      return NextResponse.json({
        ok: false,
        error: `Simulação bloqueada: classificado como "${promotion.classification}".`,
        classification: promotion.classification,
        reasons: promotion.classification_reasons,
        missing: promotion.missing_fields,
      }, { status: 400 })
    }

    // 3. Verificar se já simulou esta mesma promoção
    const existing = await prisma.promo_simulations.findFirst({
      where: {
        scenario_id,
        promotion_id,
        promotion_type: promotion_type || null,
      },
      orderBy: { created_at: 'desc' },
    })

    if (existing) {
      return NextResponse.json({
        ok: true,
        already_exists: true,
        simulation: existing,
        notice: 'Esta promoção já foi simulada antes. Registro anterior mantido.',
      })
    }

    // 4. Salvar simulação com campos CORRETOS (matching fetch-promotions output)
    const simulation = await prisma.promo_simulations.create({
      data: {
        scenario_id,
        ml_user_id: latestQuery.ml_user_id,
        mlb_at_simulation: latestQuery.mlb_at_query,
        product_name_at_sim: scenario.product_name,
        promotion_id,
        promotion_type: promotion_type || null,
        promotion_snapshot: promotion,
        scenario_snapshot: {
          id: scenario.id,
          product_name: scenario.product_name,
          mlb: scenario.mlb,
          max_seller_discount_pct: scenario.max_seller_discount_pct ? Number(scenario.max_seller_discount_pct) : null,
          min_sale_price: scenario.min_sale_price ? Number(scenario.min_sale_price) : null,
          min_net_receivable: scenario.min_net_receivable ? Number(scenario.min_net_receivable) : null,
          activation_mode: scenario.activation_mode,
          active: scenario.active,
        },
        simulation_result: 'can_join',
        // Campos do ClassifiedPromo — nomes corretos
        seller_pct: promotion.seller_pct_used != null ? parseFloat(String(promotion.seller_pct_used)) : null,
        sale_price: promotion.simulated_price != null ? parseFloat(String(promotion.simulated_price)) : null,
        net_receivable: promotion.simulated_net_receivable != null ? parseFloat(String(promotion.simulated_net_receivable)) : null,
        decision_reasons: promotion.classification_reasons || [],
        missing_fields: promotion.missing_fields || [],
        cumulative_effects: {
          pix: promotion.has_pix_discount || false,
          coupon: promotion.has_coupon || false,
          free_shipping: promotion.free_shipping || false,
        },
      },
    })

    return NextResponse.json({
      ok: true,
      simulation,
      notice: 'Simulação concluída. Nenhuma alteração foi feita no Mercado Livre.',
    })
  } catch (err: any) {
    console.error('[promo-simulations POST]', err)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

// GET: listar simulações de um cenário
export async function GET(req: NextRequest) {
  if (!isMatrizRequest(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  try {
    const { searchParams } = new URL(req.url)
    const scenarioId = searchParams.get('scenario_id')

    const where: any = {}
    if (scenarioId) where.scenario_id = scenarioId

    const simulations = await prisma.promo_simulations.findMany({
      where,
      orderBy: { created_at: 'desc' },
      take: 50,
    })

    return NextResponse.json({ ok: true, simulations })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
