/**
 * POST /api/admin/promo-scenarios/[id]/toggle
 * Ativa ou desativa um cenário
 */
import { NextRequest, NextResponse } from 'next/server'
import { isMatrizRequest } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isMatrizRequest(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  try {
    const current = await prisma.promo_scenarios.findUnique({ where: { id: params.id } })
    if (!current) return NextResponse.json({ ok: false, error: 'Cenário não encontrado' }, { status: 404 })

    const newActive = !current.active
    const updated = await prisma.promo_scenarios.update({
      where: { id: params.id },
      data: { active: newActive },
    })

    await prisma.promo_scenario_history.create({
      data: {
        scenario_id: params.id,
        event_type: newActive ? 'activated' : 'deactivated',
        old_values: { active: current.active },
        new_values: { active: newActive },
      },
    })

    return NextResponse.json({ ok: true, active: newActive, scenario: updated })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
