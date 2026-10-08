/**
 * GET /api/admin/promo-scenarios/[id]/mlb
 * Verifica se o cenário tem um MLB válido
 */
import { NextRequest, NextResponse } from 'next/server'
import { isMatrizRequest } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isMatrizRequest(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  try {
    const scenario = await prisma.promo_scenarios.findUnique({ where: { id: params.id } })
    if (!scenario) return NextResponse.json({ ok: false, error: 'Cenário não encontrado' }, { status: 404 })

    // Verificar conexão ML
    const mlAccount = await prisma.marketplace_accounts.findFirst({
      where: { plataforma: 'mercado_livre', ativa: true },
      orderBy: { created_at: 'desc' },
    })

    const connected = !!(mlAccount && mlAccount.access_token)
    const tokenExpired = !!(mlAccount && mlAccount.token_expira_em && new Date(mlAccount.token_expira_em) < new Date())

    return NextResponse.json({
      ok: true,
      scenario: { id: scenario.id, mlb: scenario.mlb, active: scenario.active },
      ml: {
        connected,
        tokenExpired,
        nickname: mlAccount?.nickname || null,
        ml_user_id: mlAccount?.account_id || null,
        expiresAt: mlAccount?.token_expira_em || null,
      },
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
