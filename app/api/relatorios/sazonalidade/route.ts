/**
 * API: Relatório de Sazonalidade
 * GET /api/relatorios/sazonalidade?meses=12
 *
 * Retorna:
 * - Vendas por mês (12 meses)
 * - Vendas por dia da semana
 * - Top produtos em cada mês
 * - Vendas por horário do dia
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const meses = parseInt(searchParams.get('meses') || '12')

    const dataInicio = new Date()
    dataInicio.setMonth(dataInicio.getMonth() - meses)

    // Buscar orders
    const orders = await prisma.orders.findMany({
      where: { created_at: { gte: dataInicio } },
      select: {
        id: true,
        created_at: true,
        total: true,
        order_items: { select: { product_id: true, quantidade: true, preco_unitario: true, products: { select: { nome: true, sku: true } } } },
      },
    })

    // Vendas por mês
    const vendasPorMes: Record<string, { mes: string; pedidos: number; receita: number; itens: number }> = {}
    const mesesNomes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

    // Vendas por dia da semana
    const vendasPorDiaSemana: Record<number, { dia: string; pedidos: number; receita: number }> = {
      0: { dia: 'Domingo', pedidos: 0, receita: 0 },
      1: { dia: 'Segunda', pedidos: 0, receita: 0 },
      2: { dia: 'Terça', pedidos: 0, receita: 0 },
      3: { dia: 'Quarta', pedidos: 0, receita: 0 },
      4: { dia: 'Quinta', pedidos: 0, receita: 0 },
      5: { dia: 'Sexta', pedidos: 0, receita: 0 },
      6: { dia: 'Sábado', pedidos: 0, receita: 0 },
    }

    // Vendas por horário
    const vendasPorHorario: Record<number, { hora: number; pedidos: number }> = {}
    for (let h = 0; h < 24; h++) vendasPorHorario[h] = { hora: h, pedidos: 0 }

    // Top produtos por mês
    const produtosPorMes: Record<string, Map<string, { sku: string; nome: string; qtd: number; receita: number }>> = {}

    let totalReceita = 0
    let totalPedidos = 0
    let totalItens = 0

    for (const order of orders) {
      if (!order.created_at) continue
      const data = new Date(order.created_at)
      const mesKey = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`
      const mesLabel = `${mesesNomes[data.getMonth()]}/${String(data.getFullYear()).slice(2)}`
      const diaSemana = data.getDay()
      const hora = data.getHours()
      const total = Number(order.total)

      if (!vendasPorMes[mesKey]) {
        vendasPorMes[mesKey] = { mes: mesLabel, pedidos: 0, receita: 0, itens: 0 }
      }
      vendasPorMes[mesKey].pedidos++
      vendasPorMes[mesKey].receita += total
      vendasPorMes[mesKey].itens += order.order_items.reduce((acc, i) => acc + i.quantidade, 0)

      vendasPorDiaSemana[diaSemana].pedidos++
      vendasPorDiaSemana[diaSemana].receita += total
      vendasPorHorario[hora].pedidos++

      totalReceita += total
      totalPedidos++
      totalItens += order.order_items.reduce((acc, i) => acc + i.quantidade, 0)

      // Por mês e produto
      if (!produtosPorMes[mesKey]) produtosPorMes[mesKey] = new Map()
      for (const item of order.order_items) {
        const key = item.product_id
        const current = produtosPorMes[mesKey].get(key) || { sku: item.products.sku, nome: item.products.nome, qtd: 0, receita: 0 }
        current.qtd += item.quantidade
        current.receita += item.quantidade * Number(item.preco_unitario)
        produtosPorMes[mesKey].set(key, current)
      }
    }

    // Ordenar vendas por mês
    const vendasPorMesArray = Object.entries(vendasPorMes)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, val]) => ({ key, ...val }))

    // Top 5 produtos em cada mês (últimos 3 meses)
    const topPorMes: { mes: string; top: any[] }[] = []
    const ultimosMeses = vendasPorMesArray.slice(-3)
    for (const m of ultimosMeses) {
      const top = Array.from(produtosPorMes[m.key]?.values() || [])
        .sort((a, b) => b.qtd - a.qtd)
        .slice(0, 5)
      topPorMes.push({ mes: m.mes, top })
    }

    // Detectar tendências: comparar último mês vs média
    const tendencias = vendasPorMesArray.map((m, i, arr) => {
      if (i === 0) return { ...m, variacao: 0 }
      const anteriores = arr.slice(0, i)
      const media = anteriores.reduce((acc, x) => acc + x.receita, 0) / anteriores.length
      const variacao = media > 0 ? ((m.receita - media) / media) * 100 : 0
      return { ...m, variacao }
    })

    return NextResponse.json({
      success: true,
      data: {
        resumo: {
          total_pedidos: totalPedidos,
          total_receita: totalReceita,
          total_itens: totalItens,
          ticket_medio: totalPedidos > 0 ? totalReceita / totalPedidos : 0,
        },
        vendas_por_mes: vendasPorMesArray,
        vendas_por_dia_semana: Object.values(vendasPorDiaSemana),
        vendas_por_horario: Object.values(vendasPorHorario),
        top_por_mes: topPorMes,
        tendencias,
      },
    })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
