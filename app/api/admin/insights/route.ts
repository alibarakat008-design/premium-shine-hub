// GET /api/admin/insights
// Retorna insights sobre o negócio:
// - Comparativo de hoje vs ontem vs mesmo dia semana passada
// - Top produtos subindo/descendo
// - Horários de pico
// - Resumo textual automático

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    const now = new Date()
    const inicioHoje = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const inicioOntem = new Date(inicioHoje.getTime() - 24 * 3600 * 1000)
    const inicio7d = new Date(inicioHoje.getTime() - 7 * 24 * 3600 * 1000)
    const inicio14d = new Date(inicioHoje.getTime() - 14 * 24 * 3600 * 1000)
    const inicio28d = new Date(inicioHoje.getTime() - 28 * 24 * 3600 * 1000)
    const mesmoDiaSemanaPassada = new Date(inicioHoje.getTime() - 7 * 24 * 3600 * 1000)

    // MULTI-TENANT: filtra por company_id (cookie OU query)
    const companyId = req.cookies.get('psh_session_company')?.value
      || req.cookies.get('psh_session_active_company')?.value
      || req.nextUrl.searchParams.get('company_id')
      || null
    const ordersWhere: any = { created_at: { gte: inicio28d } }
    if (companyId) ordersWhere.company_id = companyId

    // Buscar orders em batch
    const orders = await prisma.orders.findMany({
      where: ordersWhere,
      select: {
        id: true,
        total: true,
        status: true,
        created_at: true,
        order_items: {
          select: {
            quantidade: true,
            products: {
              select: {
                id: true,
                sku: true,
                nome: true,
                foto_principal_url: true,
                product_prices: { where: { canal: 'mercado_livre' }, select: { custo: true, preco_venda: true }, take: 1 },
              },
            },
          },
        },
      },
    })

    // Separar por janela
    const ordersHoje = orders.filter((o) => o.created_at && o.created_at >= inicioHoje && o.status !== 'cancelado')
    const ordersOntem = orders.filter((o) => o.created_at && o.created_at >= inicioOntem && o.created_at < inicioHoje && o.status !== 'cancelado')
    const orders7d = orders.filter((o) => o.created_at && o.created_at >= inicio7d && o.status !== 'cancelado')
    const orders7dAnterior = orders.filter((o) => o.created_at && o.created_at >= inicio14d && o.created_at < inicio7d && o.status !== 'cancelado')
    const ordersMesmoDia = orders.filter((o) => o.created_at && o.created_at >= mesmoDiaSemanaPassada && o.created_at < inicioHoje && o.status !== 'cancelado')

    // KPIs
    const sumTotal = (arr: any[]) => arr.reduce((s, o) => s + Number(o.total || 0), 0)
    const countTotal = (arr: any[]) => arr.length

    const hoje = {
      pedidos: countTotal(ordersHoje),
      receita: sumTotal(ordersHoje),
      itens: ordersHoje.reduce((s, o) => s + o.order_items.reduce((s2, i) => s2 + (i.quantidade || 0), 0), 0),
    }
    const ontem = {
      pedidos: countTotal(ordersOntem),
      receita: sumTotal(ordersOntem),
    }
    const ult7d = {
      pedidos: countTotal(orders7d),
      receita: sumTotal(orders7d),
    }
    const ant7d = {
      pedidos: countTotal(orders7dAnterior),
      receita: sumTotal(orders7dAnterior),
    }
    const mesmoDia = {
      pedidos: countTotal(ordersMesmoDia),
      receita: sumTotal(ordersMesmoDia),
    }

    // Variações
    const variacaoPct = (atual: number, anterior: number) =>
      anterior > 0 ? Number((((atual - anterior) / anterior) * 100).toFixed(1)) : 0

    // Top produtos (7d)
    const productMap: Record<string, { id: string; sku: string; nome: string; foto: string | null; qtd7: number; qtdAnt: number; receita7: number; receitaAnt: number }> = {}
    for (const o of orders7d) {
      for (const it of o.order_items) {
        if (!it.products) continue
        const k = it.products.id
        if (!productMap[k]) {
          productMap[k] = {
            id: k, sku: it.products.sku, nome: it.products.nome, foto: it.products.foto_principal_url,
            qtd7: 0, qtdAnt: 0, receita7: 0, receitaAnt: 0,
          }
        }
        productMap[k].qtd7 += it.quantidade || 0
        productMap[k].receita7 += Number(it.quantidade || 0) * Number(it.products.product_prices?.[0]?.preco_venda || 0)
      }
    }
    for (const o of orders7dAnterior) {
      for (const it of o.order_items) {
        if (!it.products) continue
        const k = it.products.id
        if (productMap[k]) {
          productMap[k].qtdAnt += it.quantidade || 0
          productMap[k].receitaAnt += Number(it.quantidade || 0) * Number(it.products.product_prices?.[0]?.preco_venda || 0)
        }
      }
    }

    const produtosSubindo = Object.values(productMap)
      .filter((p) => p.qtdAnt > 0 && p.qtd7 > p.qtdAnt * 1.3)
      .map((p) => ({ ...p, variacao_pct: variacaoPct(p.qtd7, p.qtdAnt) }))
      .sort((a, b) => b.variacao_pct - a.variacao_pct)
      .slice(0, 5)

    const produtosCaindo = Object.values(productMap)
      .filter((p) => p.qtdAnt > 0 && p.qtd7 < p.qtdAnt * 0.7)
      .map((p) => ({ ...p, variacao_pct: variacaoPct(p.qtd7, p.qtdAnt) }))
      .sort((a, b) => a.variacao_pct - b.variacao_pct)
      .slice(0, 5)

    const topProdutos = Object.values(productMap)
      .sort((a, b) => b.qtd7 - a.qtd7)
      .slice(0, 10)

    // Horários de pico (7d, só pagos)
    const horaMap: Record<number, number> = {}
    for (let h = 0; h < 24; h++) horaMap[h] = 0
    for (const o of orders7d) {
      if (!o.created_at) continue
      const h = new Date(o.created_at).getHours()
      horaMap[h]++
    }
    const horaPico = Number(
      Object.entries(horaMap).sort(([, a], [, b]) => b - a)[0]?.[0] || 12
    )

    // Resumo textual (IA simples)
    const insights: string[] = []
    if (hoje.pedidos > 0) {
      const variacao = variacaoPct(hoje.pedidos, ontem.pedidos)
      if (variacao > 20) insights.push(`🚀 Hoje está ${variacao}% acima de ontem em vendas.`)
      else if (variacao < -20) insights.push(`📉 Hoje está ${Math.abs(variacao)}% abaixo de ontem em vendas.`)
      else insights.push(`➡️ Vendas de hoje estão estáveis (${variacao > 0 ? '+' : ''}${variacao}%).`)
    } else {
      insights.push('⏳ Nenhuma venda hoje ainda. Vamos lá!')
    }

    if (ult7d.receita > ant7d.receita * 1.2) {
      insights.push(`💰 Receita da semana subiu ${variacaoPct(ult7d.receita, ant7d.receita)}% vs semana passada.`)
    } else if (ult7d.receita < ant7d.receita * 0.8) {
      insights.push(`⚠️ Receita da semana caiu ${Math.abs(variacaoPct(ult7d.receita, ant7d.receita))}% vs semana passada.`)
    }

    if (produtosSubindo.length > 0) {
      insights.push(`📈 ${produtosSubindo.length} produto(s) em alta essa semana: ${produtosSubindo.slice(0, 3).map((p) => p.sku).join(', ')}.`)
    }
    if (produtosCaindo.length > 0) {
      insights.push(`📉 ${produtosCaindo.length} produto(s) em queda: ${produtosCaindo.slice(0, 3).map((p) => p.sku).join(', ')}.`)
    }
    insights.push(`⏰ Pico de vendas: ${horaPico}h.`)

    return NextResponse.json({
      ok: true,
      kpis: {
        hoje: { ...hoje, ticket_medio: hoje.pedidos > 0 ? hoje.receita / hoje.pedidos : 0 },
        ontem: { ...ontem, ticket_medio: ontem.pedidos > 0 ? ontem.receita / ontem.pedidos : 0 },
        variacao_dia_pedidos: variacaoPct(hoje.pedidos, ontem.pedidos),
        variacao_dia_receita: variacaoPct(hoje.receita, ontem.receita),
        ult_7d: { ...ult7d, ticket_medio: ult7d.pedidos > 0 ? ult7d.receita / ult7d.pedidos : 0 },
        ant_7d: { ...ant7d, ticket_medio: ant7d.pedidos > 0 ? ant7d.receita / ant7d.pedidos : 0 },
        variacao_semana_pedidos: variacaoPct(ult7d.pedidos, ant7d.pedidos),
        variacao_semana_receita: variacaoPct(ult7d.receita, ant7d.receita),
        mesmo_dia_semana: mesmoDia,
      },
      insights,
      produtos: {
        subindo: produtosSubindo,
        caindo: produtosCaindo,
        top_7d: topProdutos,
      },
      hora_pico: horaPico,
      horas: horaMap,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message, stack: err.stack }, { status: 500 })
  }
}
