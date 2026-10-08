/**
 * =====================================================
 * API: Promoções Automáticas Mercado Livre
 * =====================================================
 *
 * POST /api/ml/promocoes/criar
 *   Body: { listing_id, tipo: 'percentage'|'fixed', desconto: 10, duracao_dias: 7 }
 *   Cria uma promoção no ML
 *
 * GET /api/ml/promocoes?listing_id=MLB...
 *   Lista promoções ativas
 *
 * DELETE /api/ml/promocoes?listing_id=MLB...&promotion_id=xxx
 *   Remove uma promoção
 * =====================================================
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const listingId = searchParams.get('listing_id')

    if (!listingId) {
      return NextResponse.json({ success: false, error: 'listing_id obrigatório' }, { status: 400 })
    }

    // Buscar conta
    const listing = await prisma.marketplace_listings.findFirst({
      where: { listing_id: listingId },
      include: { marketplace_accounts: true },
    })

    if (!listing || !listing.marketplace_accounts?.access_token) {
      return NextResponse.json({ success: false, error: 'Listing ou conta não encontrada' }, { status: 404 })
    }

    const res = await fetch(`https://api.mercadolibre.com/seller-promotions/promotions/${listingId}?app_version=v2`, {
      headers: { Authorization: `Bearer ${listing.marketplace_accounts.access_token}` },
    })

    if (!res.ok) {
      const err = await res.text()
      return NextResponse.json({ success: false, error: `ML API ${res.status}: ${err}` }, { status: res.status })
    }

    const promocoes = await res.json()
    return NextResponse.json({ success: true, data: promocoes })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { listing_id, tipo = 'percentage', desconto, duracao_dias = 7 } = body

    if (!listing_id || !desconto) {
      return NextResponse.json({ success: false, error: 'listing_id e desconto obrigatórios' }, { status: 400 })
    }

    if (tipo !== 'percentage' && tipo !== 'fixed') {
      return NextResponse.json({ success: false, error: 'tipo deve ser "percentage" ou "fixed"' }, { status: 400 })
    }

    const listing = await prisma.marketplace_listings.findFirst({
      where: { listing_id },
      include: { marketplace_accounts: true },
    })

    if (!listing || !listing.marketplace_accounts?.access_token) {
      return NextResponse.json({ success: false, error: 'Listing ou conta não encontrada' }, { status: 404 })
    }

    // Calcular datas
    const now = new Date()
    const fim = new Date(now.getTime() + duracao_dias * 24 * 60 * 60 * 1000)

    // Preço com desconto
    const precoAtual = Number(listing.preco_atual || 0)
    let precoPromocional: number
    if (tipo === 'percentage') {
      precoPromocional = Math.round(precoAtual * (1 - desconto / 100) * 100) / 100
    } else {
      precoPromocional = Math.max(precoAtual - desconto, 0.01)
    }

    // Criar promoção via API do ML
    const promBody: any = {
      item_id: listing_id,
      promotion_type: tipo,
      [tipo === 'percentage' ? 'discount_percent' : 'discount_amount']: desconto,
      start_date: now.toISOString(),
      finish_date: fim.toISOString(),
    }

    const res = await fetch(`https://api.mercadolibre.com/seller-promotions/promotions/${listing_id}?app_version=v2`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${listing.marketplace_accounts.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(promBody),
    })

    if (!res.ok) {
      const err = await res.text()
      return NextResponse.json({ success: false, error: `ML API ${res.status}: ${err}` }, { status: res.status })
    }

    const result = await res.json()

    // Atualizar no nosso banco
    await prisma.marketplace_listings.update({
      where: { id: listing.id },
      data: {
        preco_promocional: precoPromocional,
        promocao_inicio: now,
        promocao_fim: fim,
        promocao_tipo: tipo,
        promocao_id_ml: String(result.id || ''),
      },
    })

    return NextResponse.json({
      success: true,
      message: `Promoção criada: ${desconto}${tipo === 'percentage' ? '%' : ' R$'} off por ${duracao_dias} dias`,
      data: {
        listing_id,
        preco_original: precoAtual,
        preco_promocional: precoPromocional,
        economia: precoAtual - precoPromocional,
        duracao_dias,
        fim: fim.toISOString(),
        ml_response: result,
      },
    })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const listingId = searchParams.get('listing_id')
    const promotionId = searchParams.get('promotion_id')

    if (!listingId || !promotionId) {
      return NextResponse.json({ success: false, error: 'listing_id e promotion_id obrigatórios' }, { status: 400 })
    }

    const listing = await prisma.marketplace_listings.findFirst({
      where: { listing_id: listingId },
      include: { marketplace_accounts: true },
    })

    if (!listing || !listing.marketplace_accounts?.access_token) {
      return NextResponse.json({ success: false, error: 'Listing ou conta não encontrada' }, { status: 404 })
    }

    const res = await fetch(`https://api.mercadolibre.com/seller-promotions/promotions/${listingId}/${promotionId}?app_version=v2`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${listing.marketplace_accounts.access_token}` },
    })

    // Limpar no banco
    await prisma.marketplace_listings.update({
      where: { id: listing.id },
      data: { preco_promocional: null, promocao_inicio: null, promocao_fim: null, promocao_id_ml: null },
    })

    return NextResponse.json({ success: true, message: 'Promoção removida' })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
