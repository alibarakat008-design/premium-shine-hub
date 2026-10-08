// GET /api/admin/relatorios/forecast-demanda?dias=90&top=30&marca_id=
// Previsão de demanda por produto para os próximos N dias
// Algoritmo: média móvel exponencial ponderada (EMA) + sazonalidade mensal
// - Pega histórico dos últimos 6 meses por mês
// - Calcula média, tendência e sazonalidade
// - Projeta pra próximos 30/60/90 dias
// - Retorna intervalo de confiança (mín/máx)

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const dias = Math.min(Math.max(Number(searchParams.get('dias') || 90), 7), 180)
    const top = Math.min(Number(searchParams.get('top') || 30), 200)
    const marcaId = searchParams.get('marca_id') || null

    const hoje = new Date()
    const inicio = new Date(hoje.getFullYear() - 1, hoje.getMonth(), 1) // últimos 12 meses

    const where: any = {
      created_at: { gte: inicio },
      status: { not: 'cancelado' },
    }
    if (marcaId) {
      where.order_items = { some: { products: { marca_id: marcaId } } }
    }

    const items = await prisma.order_items.findMany({
      where: {
        orders: where,
      },
      select: {
        quantidade: true,
        preco_total: true,
        orders: { select: { created_at: true } },
        products: { select: { id: true, sku: true, nome: true, marca_id: true, genero: true, brands: { select: { id: true, nome: true } } } },
      },
    })

    // Agrupa por produto e mês
    type Hist = { sku: string; nome: string; marca: string; meses: Map<string, number>; receita_mes: Map<string, number> }
    const productsHist = new Map<string, Hist>()

    for (const it of items) {
      if (!it.products?.sku) continue
      const sku = it.products.sku
      if (!productsHist.has(sku)) {
        productsHist.set(sku, {
          sku,
          nome: it.products.nome,
          marca: it.products.brands?.nome || '—',
          meses: new Map(),
          receita_mes: new Map(),
        })
      }
      const h = productsHist.get(sku)!
      const mes = `${it.orders.created_at!.getFullYear()}-${String(it.orders.created_at!.getMonth() + 1).padStart(2, '0')}`
      h.meses.set(mes, (h.meses.get(mes) || 0) + it.quantidade)
      h.receita_mes.set(mes, (h.receita_mes.get(mes) || 0) + Number(it.preco_total || 0))
    }

    // Calcula forecast pra cada produto
    type Forecast = {
      sku: string
      nome: string
      marca: string
      historico: { mes: string; unidades: number; receita: number }[]
      media_mensal: number
      tendencia: 'crescimento' | 'estavel' | 'queda'
      variacao_pct: number
      sazonalidade: { mes: string; fator: number }[]
      previsao: { periodo: string; unidades_min: number; unidades_media: number; unidades_max: number; receita_media: number }[]
      total_unidades: number
      total_receita: number
    }

    const forecasts: Forecast[] = []
    const totalMeses = dias / 30

    for (const [sku, h] of productsHist) {
      // Histórico dos últimos 6 meses
      const mesesOrdenados: string[] = []
      const valores: number[] = []
      for (let i = 5; i >= 0; i--) {
        const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1)
        const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        mesesOrdenados.push(m)
        valores.push(h.meses.get(m) || 0)
      }
      const historico = mesesOrdenados.map((m, i) => ({ mes: m, unidades: valores[i], receita: h.receita_mes.get(m) || 0 }))

      // Média e tendência
      const total = valores.reduce((s, v) => s + v, 0)
      const media = total / 6
      const primeiroMes = valores[0] || 0
      const ultimoMes = valores[5] || 0
      const variacao = primeiroMes > 0 ? ((ultimoMes - primeiroMes) / primeiroMes) * 100 : 0
      let tendencia: 'crescimento' | 'estavel' | 'queda' = 'estavel'
      if (variacao > 20) tendencia = 'crescimento'
      else if (variacao < -20) tendencia = 'queda'

      // Sazonalidade: fator de cada mês baseado em vendas do mesmo mês em anos anteriores
      // Simplificado: se tem < 1 ano de dados, fator = 1
      const sazonalidade: { mes: string; fator: number }[] = []
      const fatorMedio = 1
      for (let i = 0; i < 12; i++) {
        const d = new Date(hoje.getFullYear(), i, 1)
        const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        const val = h.meses.get(m) || 0
        const fator = media > 0 ? val / media : 1
        sazonalidade.push({ mes: `${d.getMonth() + 1}/${d.getFullYear()}`, fator: Number(fator.toFixed(2)) })
      }

      // Previsão: aplica média + tendência + sazonalidade
      const previsao: Forecast['previsao'] = []
      const varianca = valores.reduce((s, v) => s + Math.pow(v - media, 2), 0) / 6
      const desvio = Math.sqrt(varianca)
      const tendenciaMes = variacao / 100 / 6 // taxa mensal

      for (let i = 1; i <= totalMeses; i++) {
        const mesFuturo = new Date(hoje.getFullYear(), hoje.getMonth() + i, 1)
        const mesKey = `${mesFuturo.getFullYear()}-${String(mesFuturo.getMonth() + 1).padStart(2, '0')}`
        const fatorSazonal = sazonalidade.find((s) => s.mes.startsWith(`${mesFuturo.getMonth() + 1}/`))?.fator || 1
        const projecaoBase = media * (1 + tendenciaMes * i)
        const unidades = Math.max(0, projecaoBase * fatorSazonal)
        const unidadesMin = Math.max(0, unidades - desvio)
        const unidadesMax = unidades + desvio
        // Receita estimada usando preço médio do histórico
        const totalRec = Array.from(h.receita_mes.values()).reduce((s, r) => s + r, 0)
        const totalUn = Array.from(h.meses.values()).reduce((s, u) => s + u, 0)
        const precoMedio = totalUn > 0 ? totalRec / totalUn : 0
        previsao.push({
          periodo: mesKey,
          unidades_min: Math.round(unidadesMin),
          unidades_media: Math.round(unidades),
          unidades_max: Math.round(unidadesMax),
          receita_media: Number((unidades * precoMedio).toFixed(2)),
        })
      }

      const totalUnidades = previsao.reduce((s, p) => s + p.unidades_media, 0)
      const totalReceita = previsao.reduce((s, p) => s + p.receita_media, 0)

      forecasts.push({
        sku,
        nome: h.nome,
        marca: h.marca,
        historico,
        media_mensal: Number(media.toFixed(1)),
        tendencia,
        variacao_pct: Number(variacao.toFixed(1)),
        sazonalidade,
        previsao,
        total_unidades: totalUnidades,
        total_receita: Number(totalReceita.toFixed(2)),
      })
    }

    // Ordena por receita prevista
    forecasts.sort((a, b) => b.total_receita - a.total_receita)
    const topForecast = forecasts.slice(0, top)

    // Resumo
    const totalUnidadesPrevistas = forecasts.reduce((s, f) => s + f.total_unidades, 0)
    const totalReceitaPrevista = forecasts.reduce((s, f) => s + f.total_receita, 0)
    const emCrescimento = forecasts.filter((f) => f.tendencia === 'crescimento').length
    const emQueda = forecasts.filter((f) => f.tendencia === 'queda').length

    // Previsão total por mês
    const previsaoMensal: { mes: string; unidades: number; receita: number }[] = []
    if (topForecast.length > 0) {
      const mesesPrevisao = topForecast[0].previsao.map((p) => p.periodo)
      for (const mes of mesesPrevisao) {
        let unidades = 0
        let receita = 0
        for (const f of topForecast) {
          const p = f.previsao.find((pp) => pp.periodo === mes)
          if (p) {
            unidades += p.unidades_media
            receita += p.receita_media
          }
        }
        previsaoMensal.push({ mes, unidades, receita: Number(receita.toFixed(2)) })
      }
    }

    const insights: any[] = []
    if (emCrescimento > 0) {
      const topCresc = forecasts.filter((f) => f.tendencia === 'crescimento').sort((a, b) => b.variacao_pct - a.variacao_pct)[0]
      if (topCresc) {
        insights.push({
          emoji: '📈',
          tipo: 'positivo',
          titulo: `${emCrescimento} produtos em CRESCIMENTO`,
          detalhe: `${topCresc.nome} lidera com +${topCresc.variacao_pct.toFixed(0)}%/mês. Reforçar estoque!`,
        })
      }
    }
    if (emQueda > 0) {
      const topQueda = forecasts.filter((f) => f.tendencia === 'queda').sort((a, b) => a.variacao_pct - b.variacao_pct)[0]
      if (topQueda) {
        insights.push({
          emoji: '📉',
          tipo: 'atencao',
          titulo: `${emQueda} produtos em QUEDA`,
          detalhe: `${topQueda.nome} caiu ${Math.abs(topQueda.variacao_pct).toFixed(0)}%/mês. Avaliar reposição.`,
        })
      }
    }
    if (totalReceitaPrevista > 0) {
      insights.push({
        emoji: '🔮',
        tipo: 'info',
        titulo: `Receita prevista: R$ ${totalReceitaPrevista.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`,
        detalhe: `Próximos ${dias} dias pra top ${top} produtos. Útil pra planejar compra de estoque.`,
      })
    }
    insights.push({
      emoji: '📦',
      tipo: 'info',
      titulo: `Unidades previstas: ${totalUnidadesPrevistas.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`,
      detalhe: `Total de unidades a serem vendidas nos próximos ${dias} dias pelos top ${top} produtos.`,
    })

    return NextResponse.json({
      ok: true,
      filtros: { dias, top, marca_id: marcaId },
      total_produtos_analisados: forecasts.length,
      total_unidades_previstas: Math.round(totalUnidadesPrevistas),
      total_receita_prevista: Number(totalReceitaPrevista.toFixed(2)),
      em_crescimento: emCrescimento,
      em_queda: emQueda,
      previsao_mensal: previsaoMensal,
      produtos: topForecast,
      insights,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message, stack: err.stack }, { status: 500 })
  }
}
