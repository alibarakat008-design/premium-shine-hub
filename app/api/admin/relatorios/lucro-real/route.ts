// GET /api/admin/relatorios/lucro-real?meses=6
// Análise de lucro REAL por pedido:
// Lucro = Receita - Custo_produto - Comissão ML - Frete - Embalagem
// Margem_real_pct = (Lucro / Receita) * 100
// - Top produtos mais/menos lucrativos
// - Clientes não-lucrativos (geram prejuízo)
// - Lucro por marca/canal
// - Comissão ML detecta automaticamente: Full (17%), Agência (14%), Clássico (13%)

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { comissaoML, detectarTipoML } from '@/lib/comissoes'
import { pickCusto } from '@/lib/custos'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const COMISSOES: Record<string, number> = {
  mercado_livre: 14,
  shopee: 14,
  site_b2c: 4,
  whatsapp: 0,
  b2b: 5,
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const meses = Math.min(Number(searchParams.get('meses') || 6), 12)
    const limit = Math.min(Number(searchParams.get('limit') || 100), 500)

    const dataInicio = new Date()
    dataInicio.setMonth(dataInicio.getMonth() - meses)

    const orders = await prisma.orders.findMany({
      where: {
        created_at: { gte: dataInicio },
        status: { not: 'cancelado' },
      },
      select: {
        id: true,
        order_number: true,
        total: true,
        frete: true,
        embalagem: true,
        origem: true,
        created_at: true,
        comissao_seller_valor: true,
        customers: { select: { id: true, nome: true } },
        order_items: {
          select: {
            quantidade: true,
            preco_total: true,
            products: {
              select: {
                sku: true,
                nome: true,
                brands: { select: { id: true, nome: true } },
                product_prices: {
                  take: 1,
                  orderBy: { preco_venda: 'desc' },
                  select: { custo: true, canal: true },
                },
                marketplace_listings: { take: 1, select: { envio_full: true, listing_type: true } },
              },
            },
          },
        },
      },
    })

    type OrderLucro = {
      id: string
      order_number: string
      cliente_nome: string
      data: string
      origem: string
      receita: number
      custo_produto: number
      comissao: number
      frete: number
      embalagem: number
      custo_total: number
      lucro: number
      margem_pct: number
    }

    const orderResults: OrderLucro[] = []
    let totalReceita = 0
    let totalCustoProduto = 0
    let totalComissao = 0
    let totalFrete = 0
    let totalEmbalagem = 0
    let totalLucro = 0

    // Por produto
    interface ProdAgg {
      sku: string
      nome: string
      marca: string
      unidades: number
      receita: number
      custo: number
      lucro: number
      margem_pct: number
    }
    const prodsMap = new Map<string, ProdAgg>()

    // Por cliente
    const clientesMap = new Map<string, { id: string; nome: string; receita: number; custo: number; lucro: number; pedidos: number; lucro_por_pedido: number }>()

    for (const o of orders) {
      const receita = Number(o.total || 0)
      const frete = Number(o.frete || 0)
      const embalagem = Number(o.embalagem || 0)
      // Comissão: usa a salva no order OU calcula baseado em origem + listing (Full vs Agência vs Clássico)
      let comissao = 0
      if (Number(o.comissao_seller_valor || 0) > 0) {
        comissao = Number(o.comissao_seller_valor)
      } else if (o.origem === 'mercado_livre') {
        // Detecta tipo ML pelo listing do primeiro item
        const lst = (o.order_items?.[0] as any)?.products?.marketplace_listings?.[0]
        const item = { listing: lst }
        comissao = receita * comissaoML(item)
      } else {
        comissao = receita * (COMISSOES[o.origem] || 0) / 100
      }

      // Soma custo dos produtos
      let custoProd = 0
      for (const it of o.order_items) {
        const custoUnit = pickCusto(it.products?.product_prices, o.origem)
        custoProd += custoUnit * it.quantidade

        // Acumula por produto
        const sku = it.products?.sku
        if (sku) {
          if (!prodsMap.has(sku)) {
            prodsMap.set(sku, {
              sku,
              nome: it.products?.nome || '',
              marca: it.products?.brands?.nome || '—',
              unidades: 0,
              receita: 0,
              custo: 0,
              lucro: 0,
              margem_pct: 0,
            })
          }
          const p = prodsMap.get(sku)!
          p.unidades += it.quantidade
          p.receita += Number(it.preco_total || 0)
          p.custo += custoUnit * it.quantidade
        }
      }

      const custoTotal = custoProd + comissao + frete + embalagem
      const lucro = receita - custoTotal
      const margem = receita > 0 ? (lucro / receita) * 100 : 0

      orderResults.push({
        id: o.id,
        order_number: o.order_number || '',
        cliente_nome: o.customers?.nome || 'Sem nome',
        data: o.created_at?.toISOString() || '',
        origem: o.origem,
        receita,
        custo_produto: custoProd,
        comissao,
        frete,
        embalagem,
        custo_total: custoTotal,
        lucro,
        margem_pct: Number(margem.toFixed(1)),
      })

      totalReceita += receita
      totalCustoProduto += custoProd
      totalComissao += comissao
      totalFrete += frete
      totalEmbalagem += embalagem
      totalLucro += lucro

      // Por cliente
      const cid = o.customers?.id
      if (cid) {
        if (!clientesMap.has(cid)) {
          clientesMap.set(cid, { id: cid, nome: o.customers?.nome || 'Sem nome', receita: 0, custo: 0, lucro: 0, pedidos: 0, lucro_por_pedido: 0 })
        }
        const c = clientesMap.get(cid)!
        c.receita += receita
        c.custo += custoTotal
        c.lucro += lucro
        c.pedidos += 1
      }
    }

    // Finaliza lucro_por_pedido dos clientes
    for (const c of clientesMap.values()) {
      c.lucro_por_pedido = c.pedidos > 0 ? c.lucro / c.pedidos : 0
    }

    // Finaliza margem dos produtos
    for (const p of prodsMap.values()) {
      p.lucro = p.receita - p.custo
      p.margem_pct = p.receita > 0 ? Number(((p.lucro / p.receita) * 100).toFixed(1)) : 0
    }

    // Lucro por mês
    const lucroPorMes = new Map<string, { receita: number; custo: number; lucro: number; pedidos: number }>()
    for (const o of orderResults) {
      const d = new Date(o.data)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      if (!lucroPorMes.has(key)) lucroPorMes.set(key, { receita: 0, custo: 0, lucro: 0, pedidos: 0 })
      const m = lucroPorMes.get(key)!
      m.receita += o.receita
      m.custo += o.custo_total
      m.lucro += o.lucro
      m.pedidos += 1
    }

    const evolucaoMensal = Array.from(lucroPorMes.entries()).sort().map(([mes, m]) => ({
      mes,
      receita: Number(m.receita.toFixed(2)),
      custo: Number(m.custo.toFixed(2)),
      lucro: Number(m.lucro.toFixed(2)),
      margem_pct: m.receita > 0 ? Number(((m.lucro / m.receita) * 100).toFixed(1)) : 0,
      pedidos: m.pedidos,
    }))

    // Top produtos lucrativos e não-lucrativos
    const prodsArr = Array.from(prodsMap.values()).filter((p) => p.receita > 50)
    const topLucrativos = prodsArr.sort((a, b) => b.lucro - a.lucro).slice(0, 20)
    const topPrejuizo = prodsArr.filter((p) => p.lucro < 0).sort((a, b) => a.lucro - b.lucro).slice(0, 20)
    const margemBaixa = prodsArr.filter((p) => p.margem_pct < 15 && p.margem_pct >= 0).sort((a, b) => a.margem_pct - b.margem_pct).slice(0, 20)

    // Clientes não-lucrativos
    const clientesArr = Array.from(clientesMap.values())
    const clientesNaoLucrativos = clientesArr.filter((c) => c.lucro < 0).sort((a, b) => a.lucro - b.lucro).slice(0, 30)
    const clientesLucrativos = clientesArr.sort((a, b) => b.lucro - a.lucro).slice(0, 30)

    // Top orders lucrativos
    const topLucrativosOrders = [...orderResults].sort((a, b) => b.lucro - a.lucro).slice(0, 20)
    const topPrejuizoOrders = orderResults.filter((o) => o.lucro < 0).sort((a, b) => a.lucro - b.lucro).slice(0, 20)

    const margemMedia = totalReceita > 0 ? (totalLucro / totalReceita) * 100 : 0

    const insights: any[] = []
    if (margemMedia > 30) {
      insights.push({ emoji: '🏆', tipo: 'positivo', titulo: `Margem média: ${margemMedia.toFixed(1)}%`, detalhe: `Excelente saúde financeira. Lucro total: R$ ${totalLucro.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}.` })
    } else if (margemMedia > 15) {
      insights.push({ emoji: '⚠️', tipo: 'atencao', titulo: `Margem média: ${margemMedia.toFixed(1)}%`, detalhe: `Saudável mas apertada. Tem espaço pra crescer.` })
    } else if (margemMedia > 0) {
      insights.push({ emoji: '⚠️', tipo: 'atencao', titulo: `Margem baixa: ${margemMedia.toFixed(1)}%`, detalhe: `Atenção aos custos! Reveja comissões e custos de produto.` })
    } else {
      insights.push({ emoji: '💔', tipo: 'atencao', titulo: `Operando no PREJUÍZO`, detalhe: `Custos superam receita. Ação urgente necessária!` })
    }
    if (topPrejuizo.length > 0) {
      insights.push({ emoji: '📉', tipo: 'atencao', titulo: `${topPrejuizo.length} produtos dão PREJUÍZO`, detalhe: `Total perdido: R$ ${topPrejuizo.reduce((s, p) => s + Math.abs(p.lucro), 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}. Reajustar preço ou descontinuar.` })
    }
    if (clientesNaoLucrativos.length > 0) {
      insights.push({ emoji: '🚨', tipo: 'atencao', titulo: `${clientesNaoLucrativos.length} clientes dão prejuízo`, detalhe: `Total: R$ ${clientesNaoLucrativos.reduce((s, c) => s + Math.abs(c.lucro), 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}. Reveja política comercial.` })
    }
    if (margemBaixa.length > 0) {
      insights.push({ emoji: '💡', tipo: 'info', titulo: `${margemBaixa.length} produtos com margem <15%`, detalhe: `Top 3: ${margemBaixa.slice(0, 3).map((p) => `${p.nome.slice(0, 20)} (${p.margem_pct}%)`).join(', ')}` })
    }

    return NextResponse.json({
      ok: true,
      filtros: { meses },
      resumo: {
        total_pedidos: orderResults.length,
        receita_total: Number(totalReceita.toFixed(2)),
        custo_produto: Number(totalCustoProduto.toFixed(2)),
        comissao: Number(totalComissao.toFixed(2)),
        frete: Number(totalFrete.toFixed(2)),
        embalagem: Number(totalEmbalagem.toFixed(2)),
        custo_total: Number((totalCustoProduto + totalComissao + totalFrete + totalEmbalagem).toFixed(2)),
        lucro_total: Number(totalLucro.toFixed(2)),
        margem_media_pct: Number(margemMedia.toFixed(1)),
      },
      evolucao_mensal: evolucaoMensal,
      top_pedidos_lucrativos: topLucrativosOrders,
      top_pedidos_prejuizo: topPrejuizoOrders,
      top_produtos_lucrativos: topLucrativos,
      top_produtos_prejuizo: topPrejuizo,
      produtos_margem_baixa: margemBaixa,
      top_clientes_lucrativos: clientesLucrativos,
      clientes_nao_lucrativos: clientesNaoLucrativos,
      insights,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message, stack: err.stack }, { status: 500 })
  }
}
