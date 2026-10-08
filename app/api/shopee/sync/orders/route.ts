/**
 * =====================================================
 * API SYNC SHOPEE — Pedidos
 * =====================================================
 */

// app/api/shopee/sync/orders/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { syncOrdersFromShopee } from '@/lib/shopee/sync'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {

  try {
    const body = await request.json()
    const { account_id, days = 7 } = body

    if (!account_id) {
      return NextResponse.json(
        { success: false, error: 'account_id obrigatório' },
        { status: 400 }
      )
    }

    const result = await syncOrdersFromShopee(account_id, days)

    return NextResponse.json({
      success: true,
      message: `${result.criados} pedidos novos importados`,
      data: result,
    })
  } catch (err: any) {
    console.error('[API Shopee Sync Orders]', err)
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    )
  }
}
