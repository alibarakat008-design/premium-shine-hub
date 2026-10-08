/**
 * =====================================================
 * API: Gerar Pedido de Compra
 * =====================================================
 * POST /api/purchases/gerar
 *   Body: { items: [{ product_id, quantidade }], supplier_id, condicao_pagamento? }
 *
 * Cria um supplier_purchases com supplier_purchase_items
 * =====================================================
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { items, supplier_id, condicao_pagamento = 'À vista' } = body

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ success: false, error: 'items obrigatório' }, { status: 400 })
    }
    if (!supplier_id) {
      return NextResponse.json({ success: false, error: 'supplier_id obrigatório' }, { status: 400 })
    }

    // Buscar supplier
    const supplier = await prisma.suppliers.findUnique({ where: { id: supplier_id } })
    if (!supplier) {
      return NextResponse.json({ success: false, error: 'Fornecedor não encontrado' }, { status: 404 })
    }

    // Buscar company padrão
    const company = await prisma.companies.findFirst({ where: { ativa: true } })
    if (!company) {
      return NextResponse.json({ success: false, error: 'Nenhuma company ativa' }, { status: 400 })
    }

    // Calcular valor total
    let valorTotal = 0
    const itemsComPreco: { product_id: string; quantidade: number; custo_unitario: number }[] = []
    for (const item of items) {
      const mlPrice = await prisma.product_prices.findFirst({
        where: { product_id: item.product_id, canal: 'mercado_livre' },
      })
      const custo = Number(mlPrice?.custo || 0)
      if (custo <= 0) continue
      valorTotal += custo * item.quantidade
      itemsComPreco.push({ product_id: item.product_id, quantidade: item.quantidade, custo_unitario: custo })
    }

    if (itemsComPreco.length === 0) {
      return NextResponse.json({ success: false, error: 'Nenhum item com custo cadastrado' }, { status: 400 })
    }

    // Criar pedido de compra
    const purchase = await prisma.supplier_purchases.create({
      data: {
        supplier_id,
        company_id: company.id,
        status: 'sugerida',
        valor_total: valorTotal,
        data_pedido: new Date(),
        condicao_pagamento,
        sugerido_por_bi: true, // veio da sugestão automática
        previsao_entrega: new Date(Date.now() + (supplier.prazo_entrega_dias || 7) * 24 * 60 * 60 * 1000),
      },
    })

    // Criar itens
    for (const item of itemsComPreco) {
      await prisma.supplier_purchase_items.create({
        data: {
          purchase_id: purchase.id,
          product_id: item.product_id,
          quantidade: item.quantidade,
          custo_unitario: item.custo_unitario,
          custo_total: item.quantidade * item.custo_unitario,
        },
      })
    }

    return NextResponse.json({
      success: true,
      message: `Pedido de compra criado! ${itemsComPreco.length} itens, total R$ ${valorTotal.toFixed(2)}`,
      data: {
        id: purchase.id,
        valor_total: valorTotal,
        itens: itemsComPreco.length,
        previsao_entrega: purchase.previsao_entrega,
        fornecedor: supplier.nome,
      },
    })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
