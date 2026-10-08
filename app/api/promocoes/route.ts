/**
 * API: Promoções Agendadas
 * GET /api/promocoes/listar
 * POST /api/promocoes/criar
 *   Body: { product_ids: [], nome, tipo, desconto, data_inicio, data_fim }
 * DELETE /api/promocoes?id=xxx
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const promocoes = await prisma.product_promotions.findMany({
      orderBy: { data_inicio: 'desc' },
      take: 100,
      include: { products: { select: { sku: true, nome: true, inventory: { select: { quantidade_atual: true } } } } },
    })
    return NextResponse.json({ success: true, data: promocoes })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { product_ids, nome, tipo, desconto, data_inicio, data_fim, descricao } = body

    if (!product_ids || product_ids.length === 0) return NextResponse.json({ success: false, error: 'Nenhum produto' }, { status: 400 })
    if (!nome) return NextResponse.json({ success: false, error: 'Nome obrigatório' }, { status: 400 })
    if (!desconto || desconto <= 0) return NextResponse.json({ success: false, error: 'Desconto obrigatório' }, { status: 400 })

    const inicio = data_inicio ? new Date(data_inicio) : new Date()
    const fim = data_fim ? new Date(data_fim) : new Date(Date.now() + 7 * 86400000)

    const created = []
    for (const pid of product_ids) {
      const mlPrice = await prisma.product_prices.findFirst({ where: { product_id: pid, canal: 'mercado_livre' } })
      if (!mlPrice) continue

      const precoOriginal = mlPrice.preco_venda ? Number(mlPrice.preco_venda.toString()) : 0
      if (precoOriginal <= 0) continue
      const precoPromocional = tipo === 'percentage'
        ? Math.round(precoOriginal * (1 - desconto / 100) * 100) / 100
        : Math.max(precoOriginal - desconto, 0.01)

      const promo = await prisma.product_promotions.create({
        data: {
          product_id: pid,
          nome,
          descricao: descricao || null,
          tipo: tipo || 'percentage',
          desconto,
          preco_original: precoOriginal,
          preco_promocional: precoPromocional,
          data_inicio: inicio,
          data_fim: fim,
          status: 'agendada',
        },
      })
      created.push(promo)
    }

    return NextResponse.json({
      success: true,
      message: `${created.length} promoções agendadas!`,
      data: { total: created.length, valor_total_desconto: created.reduce((acc, c) => acc + Number(c.preco_original) - Number(c.preco_promocional), 0) },
    })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ success: false, error: 'id obrigatório' }, { status: 400 })
    await prisma.product_promotions.delete({ where: { id } })
    return NextResponse.json({ success: true, message: 'Promoção removida' })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
