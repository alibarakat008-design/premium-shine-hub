/**
 * =====================================================
 * API SYNC SHOPEE — Produtos
 * =====================================================
 */

// app/api/shopee/sync/products/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { syncProductsFromShopee } from '@/lib/shopee/sync'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {

  try {
    const body = await request.json()
    const { account_id } = body

    if (!account_id) {
      return NextResponse.json(
        { success: false, error: 'account_id obrigatório' },
        { status: 400 }
      )
    }

    const result = await syncProductsFromShopee(account_id)

    return NextResponse.json({
      success: true,
      message: `Sincronização concluída: ${result.criados} criados, ${result.atualizados} atualizados, ${result.erros.length} erros`,
      data: result,
    })
  } catch (err: any) {
    console.error('[API Shopee Sync Products]', err)
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    )
  }
}
