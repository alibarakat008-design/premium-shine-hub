/**
 * =====================================================
 * API PUSH ESTOQUE → MERCADO LIVRE
 * =====================================================
 * Body aceita 2 formatos:
 *   { account_id, product_id } — pega estoque do banco e empurra
 *   { listing_id, quantity }   — empurra quantity específica
 *   { account_id, listing_id, quantity } — empurra quantity específica
 * =====================================================
 */

import { NextRequest, NextResponse } from 'next/server'
import { pushStockToML } from '@/lib/mercadolivre/sync'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { account_id, product_id, listing_id, quantity } = body

    // Formato 1: listing_id + quantity (do botão "Atualizar Estoque" da Tab ML)
    if (listing_id && quantity != null) {
      const listing = await prisma.marketplace_listings.findFirst({
        where: { listing_id },
        include: { marketplace_accounts: true },
      })
      if (!listing) {
        return NextResponse.json({ success: false, error: 'Anúncio não encontrado' }, { status: 404 })
      }
      if (!listing.marketplace_accounts?.access_token) {
        return NextResponse.json({ success: false, error: 'Conta sem token válido' }, { status: 400 })
      }

      // Atualizar via API do ML
      const res = await fetch(`https://api.mercadolibre.com/items/${listing_id}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${listing.marketplace_accounts.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ available_quantity: Number(quantity) }),
      })

      if (!res.ok) {
        const err = await res.text()
        return NextResponse.json({ success: false, error: `ML API error ${res.status}: ${err}` }, { status: 500 })
      }

      // Atualizar last_sync
      await prisma.marketplace_listings.update({
        where: { id: listing.id },
        data: { last_sync_at: new Date() },
      })

      return NextResponse.json({
        success: true,
        message: `Estoque atualizado: ${quantity} un. no ML`,
        data: { listing_id, quantity: Number(quantity) },
      })
    }

    // Formato 2: account_id + product_id (puxa do banco)
    if (account_id && product_id) {
      await pushStockToML(account_id, product_id)
      return NextResponse.json({
        success: true,
        message: 'Estoque do sistema enviado pro Mercado Livre',
      })
    }

    return NextResponse.json(
      { success: false, error: 'Precisa de (listing_id + quantity) ou (account_id + product_id)' },
      { status: 400 }
    )
  } catch (err: any) {
    console.error('[API ML Push Stock]', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
