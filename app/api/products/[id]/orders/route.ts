/**
 * =====================================================
 * API: Pedidos de um Produto
 * =====================================================
 * GET /api/products/:id/orders
 *
 * Retorna orders onde este produto aparece (com order_items)
 * =====================================================
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)

    // Buscar o produto
    const product = await prisma.products.findFirst({
      where: isUUID ? { id } : { sku: id },
      select: { id: true },
    })

    if (!product) {
      return NextResponse.json({ success: false, error: 'Produto não encontrado' }, { status: 404 })
    }

    // Buscar orders que têm este produto
    const orders = await prisma.orders.findMany({
      where: {
        order_items: {
          some: { product_id: product.id },
        },
      },
      include: {
        order_items: {
          where: { product_id: product.id },
          select: { id: true, quantidade: true, preco_unitario: true, preco_total: true },
        },
        customers: { select: { nome: true, email: true } },
        companies: { select: { nome_fantasia: true } },
      },
      orderBy: { created_at: 'desc' },
      take: 100,
    })

    // Formatar response
    const data = orders.map((o: any) => ({
      id: o.id,
      order_sn: o.order_number,
      status: o.status,
      created_at: o.created_at,
      total: o.total,
      subtotal: o.subtotal,
      frete: o.frete,
      // Lucro líquido (o que sobra após comissão ML) ou total
      valor_receber: o.lucro_liquido ?? o.total,
      // Comissão ML
      comissao_ml: o.comissao_seller_valor,
      // O order_items[0] tem o preço total desse produto neste pedido
      valor_produto: o.order_items?.[0]?.preco_total,
      quantidade_produto: o.order_items?.[0]?.quantidade,
      buyer_nickname: o.customers?.nome || 'Cliente ML',
      buyer_email: o.customers?.email,
      forma_pagamento: o.forma_pagamento,
      pago_em: o.pago_em,
      itens: o.order_items?.length || 0,
    }))

    return NextResponse.json({ success: true, data })
  } catch (err: any) {
    console.error('[API Product Orders]', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
