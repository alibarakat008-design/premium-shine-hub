/**
 * API: Forecast de Vendas (previsão)
 * GET /api/relatorios/forecast?meses_futuro=3
 *
 * Algoritmo: média móvel ponderada dos últimos 6 meses
 * - 40% mês mais recente
 * - 25% penúltimo
 * - 15% antepenúltimo
 * - 10% cada um dos 3 anteriores
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const mesesFuturo = parseInt(searchParams.get('meses_futuro') || '3')

    // Pegar últimos 6 meses
    const orders = await prisma.orders.findMany({
      where: { created_at: { gte: new Date(Date.now() - 6 * 30 * 24 * 3600 * 1000) } },
      select: { total: true, created_at: true, order_items: { select: { quantidade: true } } },
    })

    // Agrupar por mês
    const mesesData: Record<string, { receita: number; pedidos: number; itens: number }> = {}
    for (let i = 0; i < 6; i++) {
      const d = new Date()
      d.setMonth(d.getMonth() - i)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      mesesData[key] = { receita: 0, pedidos: 0, itens: 0 }
    }
    for (const o of orders) {
      if (!o.created_at) continue
      const d = new Date(o.created_at)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      if (mesesData[key]) {
        mesesData[key].receita += Number(o.total)
        mesesData[key].pedidos++
        mesesData[key].itens += o.order_items.reduce((acc, i) => acc + i.quantidade, 0)
      }
    }

    const mesesArr = Object.entries(mesesData)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([key, val]) => ({ key, ...val }))

    // Pesos: 40%, 25%, 15%, 10%, 5%, 5%
    const pesos = [0.40, 0.25, 0.15, 0.10, 0.05, 0.05]
    let somaPonderada = 0
    let somaPesos = 0
    for (let i = 0; i < mesesArr.length; i++) {
      somaPonderada += mesesArr[i].receita * pesos[i]
      somaPesos += pesos[i]
    }
    const previsaoReceita = somaPesos > 0 ? somaPonderada / somaPesos : 0
    const previsaoPedidos = mesesArr.reduce((acc, m) => acc + m.pedidos, 0) / mesesArr.length
    const previsaoItens = mesesArr.reduce((acc, m) => acc + m.itens, 0) / mesesArr.length

    // Calcular tendência (crescimento %)
    let tendencia = 0
    if (mesesArr.length >= 2) {
      const media3mais = mesesArr.slice(0, 3).reduce((acc, m) => acc + m.receita, 0) / 3
      const media3menos = mesesArr.slice(3, 6).reduce((acc, m) => acc + m.receita, 0) / 3
      tendencia = media3menos > 0 ? ((media3mais - media3menos) / media3menos) * 100 : 0
    }

    // Gerar projeções para próximos N meses
    const projecoes = []
    const hoje = new Date()
    for (let i = 1; i <= mesesFuturo; i++) {
      const d = new Date(hoje)
      d.setMonth(hoje.getMonth() + i)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const label = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
      // Aplicar tendência
      const fator = 1 + (tendencia / 100) * (i * 0.3) // tendência suavizada
      projecoes.push({
        key,
        label,
        receita: previsaoReceita * fator,
        pedidos: Math.round(previsaoPedidos * fator),
        itens: Math.round(previsaoItens * fator),
        confianca: Math.max(50, 90 - i * 10), // diminui com o tempo
      })
    }

    // Calcular totais
    const totalProjetado = projecoes.reduce((acc, p) => acc + p.receita, 0)
    const lucroProjetado = totalProjetado * 0.3 // margem média 30%
    const totalHistorico = mesesArr.reduce((acc, m) => acc + m.receita, 0)

    return NextResponse.json({
      success: true,
      data: {
        historico: mesesArr,
        projecoes,
        previsao_proximo_mes: previsaoReceita,
        tendencia_pct: tendencia,
        resumo: {
          receita_historica_6m: totalHistorico,
          receita_projetada: totalProjetado,
          lucro_projetado: lucroProjetado,
          meses_projetados: mesesFuturo,
        },
      },
    })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
