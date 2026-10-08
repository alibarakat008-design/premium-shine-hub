/**
 * =====================================================
 * API: Relatório de Giro de Estoque
 * =====================================================
 * GET /api/relatorios/giro-estoque?dias=30
 *
 * Para cada produto:
 *   - dias desde última venda
 *   - giro (vendas / estoque_mês)
 *   - status: ok | atenção | crítico | parado
 *   - dias de cobertura
 * =====================================================
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const dias = Math.min(parseInt(searchParams.get('dias') || '30'), 365)

    const from = new Date(Date.now() - dias * 24 * 60 * 60 * 1000)

    // Buscar produtos ativos com inventário
    const products = await prisma.products.findMany({
      where: { ativo: true },
      include: {
        inventory: true,
        order_items: {
          where: { orders: { created_at: { gte: from } } },
          include: { orders: { select: { created_at: true } } },
        },
        brands: { select: { nome: true } },
        product_prices: { where: { canal: 'mercado_livre' }, take: 1 },
        marketplace_listings: { take: 1 },
      },
    })

    const now = Date.now()
    const relatorio = products.map((p: any) => {
      const inv = p.inventory
      const estoque = inv?.quantidade_atual || 0
      const minimo = inv?.quantidade_minima || 0
      const custo = Number(p.product_prices?.[0]?.custo || 0)
      const preco = Number(p.marketplace_listings?.[0]?.preco_atual || p.product_prices?.[0]?.preco_venda || 0)

      // Calcular vendas no período
      let qtdVendida = 0
      let ultimaVenda: Date | null = null
      for (const item of p.order_items) {
        qtdVendida += Number(item.quantidade || 0)
        const dataVenda = new Date(item.orders?.created_at || 0)
        if (!ultimaVenda || dataVenda > ultimaVenda) {
          ultimaVenda = dataVenda
        }
      }

      // Velocidade (un/dia) e cobertura
      const velocidade = qtdVendida / dias
      const coberturaDias = velocidade > 0 ? estoque / velocidade : 999

      // Dias desde última venda
      const diasSemVenda = ultimaVenda ? Math.floor((now - ultimaVenda.getTime()) / 86400000) : 999

      // Capital empatado
      const capitalEmpatado = estoque * custo

      // Status
      let status: 'parado' | 'critico' | 'atencao' | 'ok' | 'sem_estoque' = 'ok'
      if (estoque === 0) status = 'sem_estoque'
      else if (diasSemVenda > 60) status = 'parado'
      else if (coberturaDias < 7) status = 'critico'
      else if (coberturaDias < 15) status = 'atencao'

      return {
        product_id: p.id,
        sku: p.sku,
        nome: p.nome,
        marca: p.brands?.nome,
        estoque,
        estoque_minimo: minimo,
        custo,
        preco,
        capital_empatado: Math.round(capitalEmpatado * 100) / 100,
        qtd_vendida_periodo: qtdVendida,
        velocidade_diaria: Math.round(velocidade * 100) / 100,
        cobertura_dias: Math.round(coberturaDias),
        dias_sem_venda: Math.min(diasSemVenda, 999),
        ultima_venda: ultimaVenda?.toISOString().substring(0, 10) || null,
        status,
      }
    })

    // Resumo
    const resumo = {
      total_produtos: relatorio.length,
      sem_estoque: relatorio.filter(r => r.status === 'sem_estoque').length,
      critico: relatorio.filter(r => r.status === 'critico').length,
      atencao: relatorio.filter(r => r.status === 'atencao').length,
      ok: relatorio.filter(r => r.status === 'ok').length,
      parado: relatorio.filter(r => r.status === 'parado').length,
      capital_empatado_total: Math.round(relatorio.reduce((acc, r) => acc + r.capital_empatado, 0) * 100) / 100,
      produtos_sem_venda: relatorio.filter(r => r.dias_sem_venda > 30).length,
    }

    return NextResponse.json({
      success: true,
      data: {
        periodo: { days: dias, from: from.toISOString().substring(0, 10), to: new Date().toISOString().substring(0, 10) },
        resumo,
        produtos: relatorio,
      },
    })
  } catch (err: any) {
    console.error('[API Giro]', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
