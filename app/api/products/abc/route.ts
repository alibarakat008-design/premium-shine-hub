/**
 * =====================================================
 * API: Curva ABC dos Produtos
 * =====================================================
 * GET /api/products/abc?days=90
 *
 * Retorna produtos classificados A/B/C baseado no faturamento:
 *   A = 80% do faturamento (top sellers)
 *   B = 15% do faturamento
 *   C = 5% do faturamento
 * =====================================================
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const days = Math.min(parseInt(searchParams.get('days') || '90'), 365)

    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

    // Buscar todos produtos com vendas no período
    const products = await prisma.products.findMany({
      where: {
        ativo: true,
        order_items: {
          some: { orders: { created_at: { gte: from } } },
        },
      },
      include: {
        order_items: {
          where: { orders: { created_at: { gte: from } } },
          include: { orders: { select: { total: true, comissao_seller_valor: true } } },
        },
        brands: { select: { nome: true } },
      },
    })

    // Calcular faturamento por produto
    const productsWithRevenue = products.map((p: any) => {
      let receita = 0
      let comissao = 0
      let qtd = 0
      for (const item of p.order_items) {
        receita += Number(item.orders?.total || item.preco_total || 0)
        comissao += Number(item.orders?.comissao_seller_valor || 0)
        qtd += Number(item.quantidade || 0)
      }
      return {
        id: p.id,
        sku: p.sku,
        nome: p.nome,
        marca: p.brands?.nome,
        receita,
        comissao,
        lucro: receita - comissao,
        qtd_vendida: qtd,
      }
    })

    // Ordenar por receita DESC
    productsWithRevenue.sort((a, b) => b.receita - a.receita)

    // Calcular total
    const totalReceita = productsWithRevenue.reduce((acc, p) => acc + p.receita, 0)

    // Classificar ABC
    let acumulado = 0
    const classified = productsWithRevenue.map((p) => {
      acumulado += p.receita
      const pct = totalReceita > 0 ? (p.receita / totalReceita) * 100 : 0
      const pctAcumulado = totalReceita > 0 ? (acumulado / totalReceita) * 100 : 0
      let classe: 'A' | 'B' | 'C' = 'C'
      if (pctAcumulado <= 80) classe = 'A'
      else if (pctAcumulado <= 95) classe = 'B'
      return { ...p, pct, pctAcumulado, classe }
    })

    // Resumo
    const resumo = {
      total_produtos: classified.length,
      classe_a: classified.filter(p => p.classe === 'A').length,
      classe_b: classified.filter(p => p.classe === 'B').length,
      classe_c: classified.filter(p => p.classe === 'C').length,
      receita_total: totalReceita,
      receita_classe_a: classified.filter(p => p.classe === 'A').reduce((acc, p) => acc + p.receita, 0),
      receita_classe_b: classified.filter(p => p.classe === 'B').reduce((acc, p) => acc + p.receita, 0),
      receita_classe_c: classified.filter(p => p.classe === 'C').reduce((acc, p) => acc + p.receita, 0),
    }

    return NextResponse.json({
      success: true,
      data: {
        periodo: { days, from: from.toISOString().substring(0, 10), to: new Date().toISOString().substring(0, 10) },
        resumo,
        produtos: classified,
      },
    })
  } catch (err: any) {
    console.error('[API ABC]', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
