/**
 * GET /api/admin/promo-history/[scenarioId]
 */
import { NextRequest, NextResponse } from 'next/server'
import { isMatrizRequest } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: { scenarioId: string } }) {
  if (!isMatrizRequest(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  try {
    const history = await prisma.promo_scenario_history.findMany({
      where: { scenario_id: params.scenarioId },
      orderBy: { created_at: 'desc' },
      take: 100,
    })
    return NextResponse.json({ ok: true, history })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
