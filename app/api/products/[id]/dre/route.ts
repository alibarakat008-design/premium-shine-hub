/**
 * =====================================================
 * API: DRE do Produto (Demonstrativo de Resultado)
 * =====================================================
 * GET /api/products/:id/dre?days=30
 *
 * Retorna:
 *   - Receita (vendas * preço)
 *   - CMV (Custo da Mercadoria Vendida)
 *   - Comissão ML
 *   - Lucro Bruto
 *   - Margem
 *   - Vendas por dia (gráfico)
 * =====================================================
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params
    const { searchParams } = new URL(request.url)
    const days = Math.min(parseInt(searchParams.get('days') || '30'), 365)

    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    const product = await prisma.products.findFirst({
      where: isUUID ? { id } : { sku: id },
      include: {
        product_prices: { where: { canal: 'mercado_livre' } },
        marketplace_listings: { take: 1 },
      },
    })

    if (!product) {
      return NextResponse.json({ success: false, error: 'Produto não encontrado' }, { status: 404 })
    }

    const mlPrice = product.product_prices?.[0]
    const custo = Number(mlPrice?.custo || 0)
    const listing = product.marketplace_listings?.[0]

    // Buscar orders dos últimos N dias
    const fromDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

    const orders = await prisma.orders.findMany({
      where: {
        order_items: { some: { product_id: product.id } },
        created_at: { gte: fromDate },
      },
      include: {
        order_items: { where: { product_id: product.id } },
      },
      orderBy: { created_at: 'asc' },
    })

    // Calcular DRE
    let receita = 0
    let cmv = 0
    let comissaoTotal = 0
    let qtdVendida = 0

    for (const o of orders) {
      const item = o.order_items?.[0]
      if (!item) continue
      const qtd = Number(item.quantidade || 0)
      const preco = Number(item.preco_total || 0)
      qtdVendida += qtd
      receita += preco
      cmv += custo * qtd
      comissaoTotal += Number(o.comissao_seller_valor || 0)
    }

    const lucroBruto = receita - cmv
    const lucroLiquido = receita - cmv - comissaoTotal
    const margemBruta = receita > 0 ? (lucroBruto / receita) * 100 : 0
    const margemLiquida = receita > 0 ? (lucroLiquido / receita) * 100 : 0

    // Vendas por dia (para gráfico)
    const vendasPorDia: Record<string, { dia: string; vendas: number; receita: number; qtd: number }> = {}
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
      const key = d.toISOString().substring(0, 10)
      vendasPorDia[key] = { dia: key, vendas: 0, receita: 0, qtd: 0 }
    }
    for (const o of orders) {
      const key = new Date(o.created_at).toISOString().substring(0, 10)
      if (vendasPorDia[key]) {
        vendasPorDia[key].vendas += 1
        vendasPorDia[key].qtd += Number(o.order_items?.[0]?.quantidade || 0)
        vendasPorDia[key].receita += Number(o.order_items?.[0]?.preco_total || 0)
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        periodo: { days, from: fromDate.toISOString().substring(0, 10), to: new Date().toISOString().substring(0, 10) },
        produto: {
          sku: product.sku,
          nome: product.nome,
          custo,
          preco_ml: Number(listing?.preco_atual || 0),
        },
        resumo: {
          qtd_vendida: qtdVendida,
          receita,
          cmv,
          comissao_ml: comissaoTotal,
          lucro_bruto: lucroBruto,
          lucro_liquido: lucroLiquido,
          margem_bruta_pct: Math.round(margemBruta * 100) / 100,
          margem_liquida_pct: Math.round(margemLiquida * 100) / 100,
          ticket_medio: qtdVendida > 0 ? receita / qtdVendida : 0,
        },
        vendas_por_dia: Object.values(vendasPorDia),
        orders_count: orders.length,
      },
    })
  } catch (err: any) {
    console.error('[API DRE]', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
