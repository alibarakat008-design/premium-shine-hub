/**
 * =====================================================
 * API: Histórico de Preço
 * =====================================================
 * GET /api/products/:id/price-history?days=90
 *
 * Retorna o histórico de preços do produto
 * =====================================================
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params
    const { searchParams } = new URL(request.url)
    const days = parseInt(searchParams.get('days') || '90')
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    const product = await prisma.products.findFirst({
      where: isUUID ? { id } : { sku: id },
      select: { id: true },
    })
    if (!product) {
      return NextResponse.json({ success: false, error: 'Produto não encontrado' }, { status: 404 })
    }

    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    const history = await prisma.price_history.findMany({
      where: { product_id: product.id, created_at: { gte: from } },
      orderBy: { created_at: 'asc' },
    })

    // Adicionar preços atuais (ML)
    const mlListing = await prisma.marketplace_listings.findFirst({
      where: { product_id: product.id },
      orderBy: { last_sync_at: 'desc' },
    })

    return NextResponse.json({
      success: true,
      data: {
        history: history.map((h: any) => ({
          data: h.created_at,
          canal: h.canal,
          preco: Number(h.preco),
          motivo: h.motivo,
        })),
        preco_atual_ml: mlListing ? Number(mlListing.preco_atual || 0) : 0,
        preco_promocional_ml: mlListing?.preco_promocional ? Number(mlListing.preco_promocional) : null,
      },
    })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}

/**
 * POST: Salvar um snapshot de preço (chamado automaticamente pelo sync ML)
 * Body: { product_id, canal, preco, motivo? }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { product_id, canal = 'mercado_livre', preco, motivo } = body

    if (!product_id || preco == null) {
      return NextResponse.json({ success: false, error: 'product_id e preco obrigatórios' }, { status: 400 })
    }

    const product = await prisma.products.findUnique({ where: { id: product_id } })
    if (!product) {
      return NextResponse.json({ success: false, error: 'Produto não encontrado' }, { status: 404 })
    }

    // Pega company padrão
    const company = await prisma.companies.findFirst({ where: { ativa: true } })
    if (!company) {
      return NextResponse.json({ success: false, error: 'Nenhuma company ativa' }, { status: 400 })
    }

    // Salvar snapshot
    await prisma.price_history.create({
      data: {
        product_id,
        canal,
        company_id: company.id,
        preco: Number(preco),
        motivo: motivo || 'Sync automático',
      },
    })

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
