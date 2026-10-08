/**
 * =====================================================
 * API PUSH ESTOQUE → SHOPEE
 * =====================================================
 */

// app/api/shopee/sync/stock/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { pushStockToShopee } from '@/lib/shopee/sync'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {

  try {
    const body = await request.json()
    const { account_id, product_id } = body

    if (!account_id || !product_id) {
      return NextResponse.json(
        { success: false, error: 'account_id e product_id obrigatórios' },
        { status: 400 }
      )
    }

    await pushStockToShopee(account_id, product_id)

    return NextResponse.json({
      success: true,
      message: 'Estoque atualizado na Shopee',
    })
  } catch (err: any) {
    console.error('[API Shopee Push Stock]', err)
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    )
  }
}
