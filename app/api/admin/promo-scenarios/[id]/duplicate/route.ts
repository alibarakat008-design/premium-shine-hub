/**
 * POST /api/admin/promo-scenarios/[id]/duplicate
 * Duplica um cenário
 */
import { NextRequest, NextResponse } from 'next/server'
import { isMatrizRequest } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isMatrizRequest(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    const { new_name, new_mlb } = body

    const original = await prisma.promo_scenarios.findUnique({ where: { id: params.id } })
    if (!original) return NextResponse.json({ ok: false, error: 'Cenário não encontrado' }, { status: 404 })

    // Verificar se novo MLB já existe
    if (new_mlb) {
      const existing = await prisma.promo_scenarios.findUnique({ where: { mlb: new_mlb } })
      if (existing) {
        return NextResponse.json({ ok: false, error: 'Já existe um cenário para este MLB.', existing_id: existing.id }, { status: 409 })
      }
    }

    const duplicated = await prisma.promo_scenarios.create({
      data: {
        product_name: new_name || `${original.product_name} (cópia)`,
        mlb: new_mlb || '',
        max_seller_discount_pct: original.max_seller_discount_pct,
        min_sale_price: original.min_sale_price,
        min_net_receivable: original.min_net_receivable,
        activation_mode: original.activation_mode,
        active: false,
      },
    })

    await prisma.promo_scenario_history.create({
      data: {
        scenario_id: duplicated.id,
        event_type: 'scenario_duplicated',
        source_scenario_id: original.id,
        new_values: {
          product_name: duplicated.product_name,
          mlb: duplicated.mlb,
          from_scenario_id: original.id,
        },
      },
    })

    return NextResponse.json({ ok: true, scenario: duplicated })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
