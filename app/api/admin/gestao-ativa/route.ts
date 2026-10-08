/**
 * API: Gestão Ativa (Dashboard)
 * GET /api/admin/gestao-ativa?dias=7
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const COMISSOES: Record<string, number> = { mercado_livre: 13, shopee: 14, site_b2c: 4, whatsapp: 0, b2b: 5, vendedora: 10 }

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const dias = parseInt(searchParams.get('dias') || '7')

    const hoje = new Date()
    const inicio = new Date(hoje.getTime() - dias * 24 * 3600 * 1000)
    const inicioAnterior = new Date(hoje.getTime() - dias * 2 * 24 * 3600 * 1000)

    // Orders período atual
    const orders = await prisma.orders.findMany({
      where: { created_at: { gte: inicio } },
      select: {
        id: true,
        total: true,
        status: true,
        created_at: true,
        marketplace_accounts: { select: { plataforma: true } },
        order_items: { select: { quantidade: true, products: { select: { product_prices: { where: { canal: 'mercado_livre' }, select: { custo: true } } } } } },
      },
    })

    // Vendas por dia (atual)
    const vendasDiasMap: Record<string, number> = {}
    for (let i = 0; i < dias; i++) {
      const d = new Date(hoje.getTime() - i * 24 * 3600 * 1000)
      vendasDiasMap[d.toISOString().slice(0, 10)] = 0
    }
    for (const o of orders) {
      if (!o.created_at) continue
      const key = new Date(o.created_at).toISOString().slice(0, 10)
      if (vendasDiasMap[key] !== undefined) vendasDiasMap[key]++
    }
    const vendasDias = Object.entries(vendasDiasMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([data, vendas]) => ({ data, vendas }))

    // Vendas período anterior
    const vendasAnteriorMap: Record<string, number> = {}
    for (let i = 0; i < dias; i++) {
      const d = new Date(inicio.getTime() - i * 24 * 3600 * 1000)
      vendasAnteriorMap[d.toISOString().slice(0, 10)] = 0
    }
    const ordersAnterior = await prisma.orders.findMany({
      where: { created_at: { gte: inicioAnterior, lt: inicio } },
      select: { total: true, created_at: true },
    })
    for (const o of ordersAnterior) {
      if (!o.created_at) continue
      const key = new Date(o.created_at).toISOString().slice(0, 10)
      if (vendasAnteriorMap[key] !== undefined) vendasAnteriorMap[key]++
    }
    const vendasAnterior = Object.entries(vendasAnteriorMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([data, vendas]) => ({ data, vendas }))

    const totalVendas = orders.length
    const totalVendasAnterior = ordersAnterior.length
    const variacaoPct = totalVendasAnterior > 0 ? ((totalVendas - totalVendasAnterior) / totalVendasAnterior) * 100 : 0

    // Vendas por dia da semana
    const vendasDiaSemana = [0, 0, 0, 0, 0, 0, 0]
    for (const o of orders) {
      if (!o.created_at) continue
      vendasDiaSemana[new Date(o.created_at).getDay()]++
    }
    const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
    const diaMais = vendasDiaSemana.indexOf(Math.max(...vendasDiaSemana))
    const diaMenos = vendasDiaSemana.indexOf(Math.min(...vendasDiaSemana))
    const fimSemana = vendasDiaSemana[0] + vendasDiaSemana[6]
    const diasUteis = vendasDiaSemana[1] + vendasDiaSemana[2] + vendasDiaSemana[3] + vendasDiaSemana[4] + vendasDiaSemana[5]
    const fimSemanaPct = totalVendas > 0 ? (fimSemana / totalVendas) * 100 : 0
    const diasUteisPct = totalVendas > 0 ? (diasUteis / totalVendas) * 100 : 0

    let perfilLabel = 'Equilibrada'
    if (Math.abs(fimSemanaPct - 30) < 5) perfilLabel = 'Equilibrada'
    else if (fimSemanaPct > 35) perfilLabel = 'Concentrada em fim de semana'
    else perfilLabel = 'Concentrada em dias úteis'

    let perfilDesc = 'Moderadamente concentrada'
    if (diasUteisPct > 80) perfilDesc = 'Altamente concentrada em dias úteis'
    else if (diasUteisPct < 50) perfilDesc = 'Mais vendas no fim de semana'
    else perfilDesc = 'Moderadamente concentrada'

    // Resumo Financeiro
    const ordersValidos = orders.filter(o => !['cancelado', 'devolvido'].includes(o.status || ''))
    const faturamento = ordersValidos.reduce((acc, o) => acc + Number(o.total), 0)
    const ordersCancelados = orders.filter(o => ['cancelado', 'devolvido'].includes(o.status || ''))
    const cancelamentos = ordersCancelados.reduce((acc, o) => acc + Number(o.total), 0)

    let custosImpostos = 0
    for (const o of ordersValidos) {
      for (const it of o.order_items) {
        if (!it.products) continue
        const custo = it.products.product_prices?.[0]?.custo ? Number(it.products.product_prices[0].custo.toString()) : 0
        custosImpostos += custo * it.quantidade
      }
    }

    let tarifas = 0
    for (const o of ordersValidos) {
      const canal = o.marketplace_accounts?.plataforma || 'outros'
      tarifas += Number(o.total) * ((COMISSOES[canal] || 5) / 100)
    }

    const freteTotal = faturamento * 0.12
    const margemContribuicao = faturamento - cancelamentos - tarifas - custosImpostos - freteTotal
    const margemPct = faturamento > 0 ? (margemContribuicao / faturamento) * 100 : 0

    // Top SKUs (últimos 7 dias)
    const topMap: Record<string, { sku: string; nome: string; foto: string | null; vendas: number }> = {}
    const orders2 = await prisma.orders.findMany({
      where: { created_at: { gte: new Date(hoje.getTime() - 7 * 24 * 3600 * 1000) } },
      select: { order_items: { select: { quantidade: true, products: { select: { id: true, sku: true, nome: true, foto_principal_url: true } } } } },
    })
    for (const o of orders2) {
      for (const it of o.order_items) {
        if (!it.products) continue
        const k = it.products.id
        if (!topMap[k]) topMap[k] = { sku: it.products.sku, nome: it.products.nome, foto: it.products.foto_principal_url, vendas: 0 }
        topMap[k].vendas += it.quantidade
      }
    }
    const topSkus = Object.values(topMap).sort((a, b) => b.vendas - a.vendas).slice(0, 5)

    // Próximas ações
    const proximas: any[] = []
    const invCritico = await prisma.inventory.findMany({
      where: { OR: [{ quantidade_atual: 0 }, { quantidade_atual: { lte: 5 } }] },
      include: { products: { select: { id: true, sku: true, nome: true } } },
      take: 5,
    })
    for (const inv of invCritico) {
      if (!inv.products) continue
      proximas.push({
        tipo: 'estoque',
        titulo: `Estoque crítico: ${inv.products.sku}`,
        subtitulo: `acaba em <1 dia - ${inv.quantidade_atual || 0} em estoque`,
        severidade: 'critica',
        link: `/admin/produtos/${inv.products.id}`,
      })
    }

    const score = Math.max(50, 95 - (ordersCancelados.length * 5))
    let nivel = 'Verde'
    if (score < 60) nivel = 'Vermelho'
    else if (score < 75) nivel = 'Laranja'
    else if (score < 85) nivel = 'Amarelo'

    return NextResponse.json({
      success: true,
      data: {
        total_vendas: totalVendas,
        variacao_pct: variacaoPct,
        dia_mais_ativo: { dia: DIAS[diaMais], vendas: vendasDiaSemana[diaMais] },
        dia_menos_ativo: { dia: DIAS[diaMenos], vendas: vendasDiaSemana[diaMenos] },
        fim_semana_pct: fimSemanaPct,
        dias_uteis_pct: diasUteisPct,
        perfil_label: perfilLabel,
        perfil_desc: perfilDesc,
        vendas_dia: vendasDias,
        vendas_periodo_anterior: vendasAnterior,
        resumo_financeiro: {
          faturamento,
          variacao_fat_pct: 0,
          vendas_aprovadas: ordersValidos.length,
          vendas_canceladas: ordersCancelados.length,
          cancelamentos,
          tarifas,
          custos_impostos: custosImpostos,
          frete_total: freteTotal,
          margem_contribuicao: margemContribuicao,
          margem_pct: margemPct,
          periodo_anterior_fat: 0,
        },
        top_skus: topSkus,
        proximas_acoes: proximas,
        reputacao: { score, nivel, reclamacoes_abertas: 0, reclamacoes: [] },
      },
    })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message, stack: err.stack }, { status: 500 })
  }
}
