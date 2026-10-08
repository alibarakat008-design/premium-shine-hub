/**
 * GET  /api/admin/promo-scenarios  — lista cenários
 * POST /api/admin/promo-scenarios  — criar cenário
 */
import { NextRequest, NextResponse } from 'next/server'
import { isMatrizRequest } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!isMatrizRequest(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  try {
    const { searchParams } = new URL(req.url)
    const ativo = searchParams.get('active')
    const busca = searchParams.get('q')

    const where: any = {}
    if (ativo === 'true') where.active = true
    if (ativo === 'false') where.active = false
    if (busca) {
      where.OR = [
        { product_name: { contains: busca, mode: 'insensitive' } },
        { mlb: { contains: busca, mode: 'insensitive' } },
      ]
    }

    const scenarios = await prisma.promo_scenarios.findMany({
      where,
      orderBy: { created_at: 'desc' },
      include: {
        latest_query: { select: { fetched_at: true, normalized_data: true } },
        _count: { select: { simulations: true } },
      },
    })

    return NextResponse.json({ ok: true, scenarios })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  if (!isMatrizRequest(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    const { product_name, mlb, max_seller_discount_pct, min_sale_price, min_net_receivable, activation_mode, active } = body

    // Validação: pelo menos um critério financeiro
    if (!max_seller_discount_pct && !min_sale_price && !min_net_receivable) {
      return NextResponse.json({ ok: false, error: 'Pelo menos um critério financeiro é obrigatório (teto %, preço mínimo ou recebimento mínimo).' }, { status: 400 })
    }

    // Validação: MLB único
    const existing = await prisma.promo_scenarios.findUnique({ where: { mlb } })
    if (existing) {
      return NextResponse.json({ ok: false, error: 'Já existe um cenário para este MLB.', existing_id: existing.id }, { status: 409 })
    }

    const scenario = await prisma.promo_scenarios.create({
      data: {
        product_name,
        mlb,
        max_seller_discount_pct: max_seller_discount_pct ? parseFloat(max_seller_discount_pct) : null,
        min_sale_price: min_sale_price ? parseFloat(min_sale_price) : null,
        min_net_receivable: min_net_receivable ? parseFloat(min_net_receivable) : null,
        activation_mode: activation_mode || 'conservative',
        active: active !== undefined ? !!active : false,
      },
    })

    // Histórico: cenário criado
    await prisma.promo_scenario_history.create({
      data: {
        scenario_id: scenario.id,
        event_type: 'scenario_created',
        new_values: {
          product_name,
          mlb,
          max_seller_discount_pct: max_seller_discount_pct || null,
          min_sale_price: min_sale_price || null,
          min_net_receivable: min_net_receivable || null,
          activation_mode: activation_mode || 'conservative',
          active: false,
        },
      },
    })

    return NextResponse.json({ ok: true, scenario })
  } catch (err: any) {
    if (err.code === 'P2002') {
      return NextResponse.json({ ok: false, error: 'Já existe um cenário para este MLB.' }, { status: 409 })
    }
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
