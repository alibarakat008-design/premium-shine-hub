/**
 * Sync LEVE: apenas orders dos últimos 2 dias, max 100 orders
 * Retorna imediatamente após primeira página (rápido, sem timeout)
 *
 * GET /api/admin/sync-quick?secret=LUXO2026&dias=2
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { syncOrdersFromML } from '@/lib/mercadolivre/sync'

export const dynamic = 'force-dynamic'
export const maxDuration = 90

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || ''
  const { searchParams } = new URL(req.url)
  const secret = searchParams.get('secret')
  if (secret !== 'LUXO2026' && !authHeader.startsWith('Basic ')) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const dias = parseInt(searchParams.get('dias') || '2', 10)
  const t0 = Date.now()

  try {
    const account = await prisma.marketplace_accounts.findFirst({
      where: { nickname: 'LIURAESSENCE' },
    })
    if (!account) {
      return NextResponse.json({ ok: false, error: 'Conta não encontrada' }, { status: 404 })
    }

    const result = await syncOrdersFromML(account.id, { days: dias, limit: 100 })
    return NextResponse.json({
      ok: true,
      dias,
      account: account.nickname,
      total: result.total,
      criados: result.criados,
      erros: result.erros.length,
      duracao_ms: Date.now() - t0,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}