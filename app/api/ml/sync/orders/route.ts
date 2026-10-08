/**
 * =====================================================
 * API SINCRONIZAR PEDIDOS ML
 * =====================================================
 * Sincroniza pedidos + baixa estoque
 *
 * Body:
 *   { account_id, days?, all?, limit? }
 *   - days: últimos N dias (default 7)
 *   - all: true pra pegar todos os pedidos
 *   - limit: máximo de pedidos a importar (default 100)
 * =====================================================
 */

import { NextRequest, NextResponse } from 'next/server'
import { syncOrdersFromML } from '@/lib/mercadolivre/sync'

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // Vercel Hobby: 10s default é pouco pra sync de orders

export async function POST(request: NextRequest) {

  try {
    const body = await request.json()
    const { account_id, days, all, limit } = body

    if (!account_id) {
      return NextResponse.json(
        { success: false, error: 'account_id obrigatório' },
        { status: 400 }
      )
    }

    console.log(`[API] Sync de pedidos (days: ${days}, all: ${all}, limit: ${limit})...`)
    const result = await syncOrdersFromML(account_id, { days, all, limit })

    return NextResponse.json({
      success: true,
      message: `${result.criados} pedidos novos importados, ${result.erros.length} erros`,
      data: result,
    })
  } catch (err: any) {
    console.error('[API ML Sync Orders]', err)
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    )
  }
}
