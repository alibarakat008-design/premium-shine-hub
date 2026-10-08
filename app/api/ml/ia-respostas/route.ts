/**
 * API: IA Assistente de Respostas (placeholder para integração futura)
 * GET /api/ml/ia-respostas?action=listings
 * GET /api/ml/ia-respostas?action=perguntas&listing_id=xxx
 * POST /api/ml/ia-respostas { listing_id }
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')

    if (action === 'listings') {
      // Lista listings com perguntas pendentes
      const listings = await prisma.marketplace_listings.findMany({
        where: { status: 'active' },
        include: { products: { select: { sku: true, nome: true, foto_principal_url: true } } },
        take: 50,
      })
      return NextResponse.json({
        success: true,
        data: listings.map(l => ({
          id: l.id,
          sku: l.products?.sku || l.listing_id,
          nome: l.products?.nome || 'Anúncio',
          foto: l.products?.foto_principal_url,
          total_perguntas: Math.floor(Math.random() * 8), // simulado até integrar com ML
        })),
      })
    }

    if (action === 'perguntas') {
      const listingId = searchParams.get('listing_id')
      // Por enquanto, retorna array vazio
      return NextResponse.json({ success: true, data: [] })
    }

    return NextResponse.json({ success: false, error: 'action inválida' }, { status: 400 })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    // Aqui entraria a integração com OpenAI/Claude para gerar respostas
    // Por enquanto, retorna array vazio
    return NextResponse.json({ success: true, data: [], message: 'IA em modo demo' })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
