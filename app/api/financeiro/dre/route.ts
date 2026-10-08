/**
 * =====================================================
 * API: DRE Completo (Demonstrativo de Resultado)
 * =====================================================
 * GET /api/financeiro/dre?year=2026&month=6
 *
 * Retorna DRE completo do mês:
 *   - Receita Bruta
 *   - Deduções (cancelamentos, devoluções)
 *   - Receita Líquida
 *   - CMV (Custo da Mercadoria Vendida)
 *   - Lucro Bruto
 *   - Despesas Operacionais (estimadas)
 *   - Comissão ML
 *   - Lucro Operacional (EBIT)
 *   - Impostos (estimados)
 *   - Lucro Líquido
 *   - Margem Líquida %
 *   - Breakdown por canal/origem
 *   - Evolução diária
 * =====================================================
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const now = new Date()
    const year = parseInt(searchParams.get('year') || String(now.getFullYear()))
    const month = parseInt(searchParams.get('month') || String(now.getMonth() + 1))

    // Início e fim do mês
    const start = new Date(year, month - 1, 1)
    const end = new Date(year, month, 1)

    // Buscar orders do mês
    const orders = await prisma.orders.findMany({
      where: {
        created_at: { gte: start, lt: end },
      },
      include: {
        order_items: true,
      },
    })

    // Calcular DRE
    let receitaBruta = 0
    let receitaCancelada = 0
    let cmv = 0
    let comissaoTotal = 0
    let comissaoVendedorTotal = 0
    let comissaoVendedoraTotal = 0
    let comissaoAfiliadoTotal = 0
    let freteTotal = 0
    let totalPedidos = 0
    let pedidosPagos = 0
    let qtdItensVendidos = 0

    // Breakdown por canal
    const porOrigem: Record<string, { receita: number; pedidos: number; itens: number }> = {}

    // Evolução diária
    const porDia: Record<string, { receita: number; pedidos: number; lucro: number }> = {}

    for (const o of orders) {
      const total = Number(o.total || 0)
      const subtotal = Number(o.subtotal || 0)
      const frete = Number(o.frete || 0)
      const cmvItem = Number(o.custo_total || 0)
      const comissaoML = Number(o.comissao_seller_valor || 0)
      const comissaoVendedor = Number(o.comissao_vendedora_valor || 0)
      const comissaoVendedora = Number(o.comissao_vendedora_valor || 0)
      const comissaoAfiliado = Number(o.comissao_afiliado_valor || 0)
      const status = o.status

      totalPedidos += 1
      if (status === 'confirmado' || status === 'separado' || status === 'enviado' || status === 'entregue') {
        pedidosPagos += 1
        receitaBruta += total
        cmv += cmvItem
        comissaoTotal += comissaoML
        comissaoVendedorTotal += comissaoVendedor
        comissaoVendedoraTotal += comissaoVendedora
        comissaoAfiliadoTotal += comissaoAfiliado
        freteTotal += frete

        // Por origem
        const origem = o.origem || 'outros'
        if (!porOrigem[origem]) porOrigem[origem] = { receita: 0, pedidos: 0, itens: 0 }
        porOrigem[origem].receita += total
        porOrigem[origem].pedidos += 1
        porOrigem[origem].itens += o.order_items?.length || 0

        // Por dia
        const dia = new Date(o.created_at).toISOString().substring(0, 10)
        if (!porDia[dia]) porDia[dia] = { receita: 0, pedidos: 0, lucro: 0 }
        porDia[dia].receita += total
        porDia[dia].pedidos += 1
        porDia[dia].lucro += subtotal - cmvItem - comissaoTotal
      } else if (status === 'cancelado' || status === 'devolvido') {
        receitaCancelada += total
      }

      qtdItensVendidos += o.order_items?.length || 0
    }

    // Despesas operacionais estimadas (empresa sem cadastro, então estimo 5% da receita)
    const despesasOperacionais = receitaBruta * 0.05
    // Impostos (Simples Nacional 6% sobre receita bruta)
    const impostos = receitaBruta * 0.06

    // DRE
    const receitaLiquida = receitaBruta - receitaCancelada
    const lucroBruto = receitaLiquida - cmv
    const lucroOperacional = lucroBruto - comissaoTotal - comissaoVendedorTotal - comissaoVendedoraTotal - comissaoAfiliadoTotal - despesasOperacionais - freteTotal
    const lucroLiquido = lucroOperacional - impostos
    const margemBruta = receitaLiquida > 0 ? (lucroBruto / receitaLiquida) * 100 : 0
    const margemOperacional = receitaLiquida > 0 ? (lucroOperacional / receitaLiquida) * 100 : 0
    const margemLiquida = receitaLiquida > 0 ? (lucroLiquido / receitaLiquida) * 100 : 0

    // Ticket médio
    const ticketMedio = pedidosPagos > 0 ? receitaBruta / pedidosPagos : 0

    return NextResponse.json({
      success: true,
      data: {
        periodo: { year, month, from: start.toISOString().substring(0, 10), to: new Date(end.getTime() - 86400000).toISOString().substring(0, 10) },
        dre: {
          receita_bruta: Math.round(receitaBruta * 100) / 100,
          deducoes: Math.round(receitaCancelada * 100) / 100,
          receita_liquida: Math.round(receitaLiquida * 100) / 100,
          cmv: Math.round(cmv * 100) / 100,
          lucro_bruto: Math.round(lucroBruto * 100) / 100,
          margem_bruta_pct: Math.round(margemBruta * 100) / 100,

          comissao_ml: Math.round(comissaoTotal * 100) / 100,
          comissao_vendedor: Math.round(comissaoVendedorTotal * 100) / 100,
          comissao_vendedora: Math.round(comissaoVendedoraTotal * 100) / 100,
          comissao_afiliado: Math.round(comissaoAfiliadoTotal * 100) / 100,
          frete: Math.round(freteTotal * 100) / 100,
          despesas_operacionais: Math.round(despesasOperacionais * 100) / 100,

          lucro_operacional: Math.round(lucroOperacional * 100) / 100,
          margem_operacional_pct: Math.round(margemOperacional * 100) / 100,

          impostos: Math.round(impostos * 100) / 100,
          lucro_liquido: Math.round(lucroLiquido * 100) / 100,
          margem_liquida_pct: Math.round(margemLiquida * 100) / 100,
        },
        kpis: {
          total_pedidos: totalPedidos,
          pedidos_pagos: pedidosPagos,
          ticket_medio: Math.round(ticketMedio * 100) / 100,
          qtd_itens: qtdItensVendidos,
          taxa_pagamento_pct: totalPedidos > 0 ? Math.round((pedidosPagos / totalPedidos) * 10000) / 100 : 0,
        },
        por_origem: porOrigem,
        evolucao_diaria: Object.entries(porDia).map(([dia, v]) => ({ dia, ...v })).sort((a, b) => a.dia.localeCompare(b.dia)),
      },
    })
  } catch (err: any) {
    console.error('[API DRE]', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
