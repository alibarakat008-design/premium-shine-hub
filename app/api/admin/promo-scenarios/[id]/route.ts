/**
 * GET    /api/admin/promo-scenarios/[id]     — detalhe do cenário
 * PUT    /api/admin/promo-scenarios/[id]     — editar cenário
 * DELETE /api/admin/promo-scenarios/[id]     — (não implementado no MVP)
 * POST   /api/admin/promo-scenarios/[id]/toggle — ativar/desativar
 * POST   /api/admin/promo-scenarios/[id]/duplicate — duplicar
 */
import { NextRequest, NextResponse } from 'next/server'
import { isMatrizRequest } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isMatrizRequest(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  try {
    const scenario = await prisma.promo_scenarios.findUnique({
      where: { id: params.id },
      include: {
        latest_query: true,
        history: { orderBy: { created_at: 'desc' }, take: 50 },
        simulations: { orderBy: { created_at: 'desc' }, take: 20 },
      },
    })
    if (!scenario) return NextResponse.json({ ok: false, error: 'Cenário não encontrado' }, { status: 404 })
    return NextResponse.json({ ok: true, scenario })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isMatrizRequest(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    const { product_name, mlb, max_seller_discount_pct, min_sale_price, min_net_receivable, activation_mode } = body

    // Se mudou o MLB, verificar duplicidade
    const current = await prisma.promo_scenarios.findUnique({ where: { id: params.id } })
    if (!current) return NextResponse.json({ ok: false, error: 'Cenário não encontrado' }, { status: 404 })

    const oldMlb = current.mlb
    let mlbChanged = false

    if (mlb && mlb !== oldMlb) {
      mlbChanged = true
      const existing = await prisma.promo_scenarios.findUnique({ where: { mlb } })
      if (existing) {
        return NextResponse.json({ ok: false, error: 'Já existe um cenário para este MLB.', existing_id: existing.id }, { status: 409 })
      }
    }

    // Se mudou MLB, desativar e limpar consulta
    const data: any = {
      product_name,
      activation_mode: activation_mode || current.activation_mode,
    }
    if (body.active !== undefined) data.active = body.active
    if (mlb) data.mlb = mlb
    if (max_seller_discount_pct !== undefined) data.max_seller_discount_pct = max_seller_discount_pct ? parseFloat(max_seller_discount_pct) : null
    if (min_sale_price !== undefined) data.min_sale_price = min_sale_price ? parseFloat(min_sale_price) : null
    if (min_net_receivable !== undefined) data.min_net_receivable = min_net_receivable ? parseFloat(min_net_receivable) : null

    if (mlbChanged) {
      data.active = false
      await prisma.promo_latest_queries.deleteMany({ where: { scenario_id: params.id } }).catch(() => {})
    }

    const updated = await prisma.promo_scenarios.update({ where: { id: params.id }, data })

    // Histórico de alterações
    const historyEvents: any[] = []

    if (product_name !== current.product_name) {
      historyEvents.push({ scenario_id: params.id, event_type: 'product_name_changed', old_values: { product_name: current.product_name }, new_values: { product_name } })
    }
    if (mlbChanged) {
      historyEvents.push({ scenario_id: params.id, event_type: 'mlb_changed', old_values: { mlb: oldMlb }, new_values: { mlb } })
    }
    if (activation_mode && activation_mode !== current.activation_mode) {
      historyEvents.push({ scenario_id: params.id, event_type: 'mode_changed', old_values: { activation_mode: current.activation_mode }, new_values: { activation_mode } })
    }
    if (max_seller_discount_pct !== undefined && String(max_seller_discount_pct || '') !== String(current.max_seller_discount_pct || '')) {
      historyEvents.push({ scenario_id: params.id, event_type: 'criterion_changed', old_values: { max_seller_discount_pct: current.max_seller_discount_pct }, new_values: { max_seller_discount_pct: max_seller_discount_pct ? parseFloat(max_seller_discount_pct) : null } })
    }
    if (min_sale_price !== undefined && String(min_sale_price || '') !== String(current.min_sale_price || '')) {
      historyEvents.push({ scenario_id: params.id, event_type: 'criterion_changed', old_values: { min_sale_price: current.min_sale_price }, new_values: { min_sale_price: min_sale_price ? parseFloat(min_sale_price) : null } })
    }
    if (min_net_receivable !== undefined && String(min_net_receivable || '') !== String(current.min_net_receivable || '')) {
      historyEvents.push({ scenario_id: params.id, event_type: 'criterion_changed', old_values: { min_net_receivable: current.min_net_receivable }, new_values: { min_net_receivable: min_net_receivable ? parseFloat(min_net_receivable) : null } })
    }

    if (mlbChanged) {
      historyEvents.push({ scenario_id: params.id, event_type: 'deactivated', old_values: { active: current.active }, new_values: { active: false, reason: 'MLB alterado' } })
    }

    for (const ev of historyEvents) {
      await prisma.promo_scenario_history.create({ data: ev })
    }

    // Reclassificar último resultado se existir (sempre, quando mudou critério)
    let reclassified = false
    const criteriaChanged = !!(
      activation_mode !== current.activation_mode ||
      max_seller_discount_pct !== undefined ||
      min_sale_price !== undefined ||
      min_net_receivable !== undefined
    )
    if (criteriaChanged && updated) {
      const latestQuery = await prisma.promo_latest_queries.findUnique({ where: { scenario_id: params.id } })
      if (latestQuery && latestQuery.normalized_data) {
        const promotions = latestQuery.normalized_data as any[]
        const reclassified_ = classifyAll(promotions, updated)
        await prisma.promo_latest_queries.update({
          where: { scenario_id: params.id },
          data: { normalized_data: reclassified_ as any },
        })
        reclassified = true
      }
    }

    return NextResponse.json({
      ok: true,
      scenario: updated,
      reclassified,
      reclassified_at: reclassified ? new Date().toISOString() : null,
      mlbChanged,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

function classifyAll(promotions: any[], scenario: any): any[] {
  const mode = scenario.activation_mode || 'conservative'
  return promotions.map(p => {
    const reasons: string[] = []
    const missing: string[] = []
    let canJoin = true

    // Se já participa — não reclassificar
    if (p.classification === 'already_participating' || p.status === 'started') {
      return { ...p, classification: 'already_participating', classification_reasons: ['Já participa desta promoção'], missing_fields: [] }
    }

    const sellerPct = p.seller_pct_used ?? p.seller_percentage ?? null
    const simPrice = p.simulated_price ?? p.discounted_price ?? null
    const simNet = p.simulated_net_receivable ?? null

    // Critério teto de desconto
    if (scenario.max_seller_discount_pct && sellerPct !== null) {
      if (sellerPct > Number(scenario.max_seller_discount_pct)) {
        canJoin = false
        reasons.push(`Teto seller ${scenario.max_seller_discount_pct}% violado (seller cederia ${sellerPct}%)`)
      } else {
        reasons.push(`Teto seller: ✅ (${sellerPct}% ≤ ${scenario.max_seller_discount_pct}%)`)
      }
    }

    // Critério preço mínimo
    if (scenario.min_sale_price && simPrice !== null) {
      if (simPrice < Number(scenario.min_sale_price)) {
        canJoin = false
        reasons.push(`Preço mínimo R$ ${Number(scenario.min_sale_price).toFixed(2)} violado (preço simulado R$ ${simPrice.toFixed(2)})`)
      } else {
        reasons.push(`Preço mínimo: ✅ (R$ ${simPrice.toFixed(2)} ≥ R$ ${Number(scenario.min_sale_price).toFixed(2)})`)
      }
    }

    // Critério recebimento mínimo
    if (scenario.min_net_receivable) {
      if (simNet !== null) {
        if (simNet < Number(scenario.min_net_receivable)) {
          canJoin = false
          reasons.push(`Recebimento mínimo R$ ${Number(scenario.min_net_receivable).toFixed(2)} violado (líquido R$ ${simNet.toFixed(2)})`)
        } else {
          reasons.push(`Recebimento mínimo: ✅ (R$ ${simNet.toFixed(2)} ≥ R$ ${Number(scenario.min_net_receivable).toFixed(2)})`)
        }
      } else {
        missing.push('net_receivable (não pôde ser calculado — dados insuficientes)')
      }
    }

    // Cupom/Pix cumulativo detectado
    if (p.has_coupon || p.has_pix_discount) {
      reasons.push(`⚠️ Benefício cumulativo detectado (cupom ou pix) — impacto pode não estar refletido no líquido`)
    }

    // Classificar
    let classification: string
    if (missing.length > 0) {
      classification = 'inconclusive'
    } else if (canJoin) {
      classification = 'can_join'
      reasons.push('✅ Todos os critérios respeitados')
    } else {
      classification = 'cannot_join'
    }

    return {
      ...p,
      classification,
      classification_reasons: reasons,
      missing_fields: missing,
    }
  })
}
