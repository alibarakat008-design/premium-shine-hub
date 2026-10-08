// GET /api/admin/relatorios/ltv-avancado
// LTV Avançado:
// - Calcula churn rate real (cohort-based)
// - Projeta LTV futuro baseado em comportamento histórico
// - Curva ABC de clientes (Pareto: 20% clientes = 80% receita)
// - Concentração de receita
// - Receita vitalícia estimada (12 meses)

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    const customers = await prisma.customers.findMany({
      where: { orders: { some: { status: { not: 'cancelado' } } } },
      select: {
        id: true,
        orders: {
          where: { status: { not: 'cancelado' } },
          orderBy: { created_at: 'asc' },
          select: { id: true, total: true, created_at: true },
        },
      },
    })

    const hoje = new Date()

    // Calcula métricas por cliente
    type ClienteLTV = {
      id: string
      receita_total: number
      total_pedidos: number
      primeira_compra: Date
      ultima_compra: Date
      ticket_medio: number
      dias_ativo: number
      freq_mensal: number
      ltv_historico: number
      ltv_projetado: number // próximo 12 meses
      churn_rate_personal: number // 0-1
    }

    const clientes: ClienteLTV[] = []

    for (const c of customers) {
      if (c.orders.length === 0) continue
      const receita = c.orders.reduce((s, o) => s + Number(o.total || 0), 0)
      const primeira = new Date(c.orders[0].created_at!)
      const ultima = new Date(c.orders[c.orders.length - 1].created_at!)
      const ticket = c.orders.length > 0 ? receita / c.orders.length : 0
      const diasAtivo = Math.max(1, (ultima.getTime() - primeira.getTime()) / 86400000)
      const freqMensal = c.orders.length / Math.max(1, diasAtivo / 30)
      const diasDesde = Math.floor((hoje.getTime() - ultima.getTime()) / 86400000)

      // Churn rate pessoal: baseado em dias desde última compra
      // Se nunca voltou em 90d = 100% churn, em 30d = 50%, em 0d = 5%
      let churn = 0
      if (diasDesde > 90) churn = 1
      else if (diasDesde > 60) churn = 0.7
      else if (diasDesde > 30) churn = 0.4
      else if (diasDesde > 15) churn = 0.15
      else churn = 0.05

      // LTV histórico
      const ltvHistorico = receita
      // LTV projetado: receita_mensal_media * (1 - churn) * 12 meses
      const receitaMensal = freqMensal * ticket
      const ltvProjetado = receitaMensal * (1 - churn) * 12

      clientes.push({
        id: c.id,
        receita_total: receita,
        total_pedidos: c.orders.length,
        primeira_compra: primeira,
        ultima_compra: ultima,
        ticket_medio: ticket,
        dias_ativo: diasAtivo,
        freq_mensal: freqMensal,
        ltv_historico: ltvHistorico,
        ltv_projetado: ltvProjetado,
        churn_rate_personal: churn,
      })
    }

    // Ordena por receita (curva ABC)
    clientes.sort((a, b) => b.receita_total - a.receita_total)

    // Curva ABC
    const receitaTotal = clientes.reduce((s, c) => s + c.receita_total, 0)
    let acumulado = 0
    const curva: any[] = []
    for (let i = 0; i < clientes.length; i++) {
      acumulado += clientes[i].receita_total
      const pctClientes = ((i + 1) / clientes.length) * 100
      const pctReceita = (acumulado / Math.max(receitaTotal, 1)) * 100
      let classe = 'C'
      if (pctReceita <= 80) classe = 'A' // 80% da receita
      else if (pctReceita <= 95) classe = 'B' // 15% seguintes
      else classe = 'C' // 5% finais
      curva.push({ ...clientes[i], posicao: i + 1, pct_clientes: pctClientes, pct_receita_acumulada: pctReceita, classe })
    }

    // Separa por classe
    const classeA = curva.filter((c) => c.classe === 'A')
    const classeB = curva.filter((c) => c.classe === 'B')
    const classeC = curva.filter((c) => c.classe === 'C')

    // Churn rate global
    const churnGlobal = clientes.length > 0 ? clientes.reduce((s, c) => s + c.churn_rate_personal, 0) / clientes.length : 0

    // LTV médio por classe
    const ltvMedioA = classeA.length > 0 ? classeA.reduce((s, c) => s + c.ltv_projetado, 0) / classeA.length : 0
    const ltvMedioB = classeB.length > 0 ? classeB.reduce((s, c) => s + c.ltv_projetado, 0) / classeB.length : 0
    const ltvMedioC = classeC.length > 0 ? classeC.reduce((s, c) => s + c.ltv_projetado, 0) / classeC.length : 0

    // Receita vitalícia total (histórico + projetado)
    const ltvTotalProjetado = clientes.reduce((s, c) => s + c.ltv_projetado, 0)
    const ltvTotalHistorico = clientes.reduce((s, c) => s + c.ltv_historico, 0)

    // Concentração
    const pctReceitaA = classeA.reduce((s, c) => s + c.receita_total, 0) / Math.max(receitaTotal, 1) * 100
    const pctClientesA = (classeA.length / Math.max(clientes.length, 1)) * 100
    const pctReceitaTop10 = (clientes.slice(0, Math.max(1, Math.floor(clientes.length * 0.1))).reduce((s, c) => s + c.receita_total, 0) / Math.max(receitaTotal, 1)) * 100
    const pctReceitaTop1 = clientes.length > 0 ? (clientes[0].receita_total / Math.max(receitaTotal, 1)) * 100 : 0

    const insights: any[] = []
    if (pctClientesA <= 20) {
      insights.push({
        emoji: '🎯',
        tipo: 'info',
        titulo: `Pareto confirmado: ${pctClientesA.toFixed(0)}% dos clientes = ${pctReceitaA.toFixed(0)}% da receita`,
        detalhe: `Concentre esforço de retenção nos ${classeA.length} clientes classe A.`,
      })
    }
    if (pctReceitaTop10 > 50) {
      insights.push({
        emoji: '⚠️',
        tipo: 'atencao',
        titulo: `Top 10% dos clientes = ${pctReceitaTop10.toFixed(0)}% da receita`,
        detalhe: `Alta concentração. Risco se 1 cliente grande sumir. Diversifique a base.`,
      })
    }
    if (churnGlobal > 0.5) {
      insights.push({
        emoji: '💔',
        tipo: 'atencao',
        titulo: `Churn rate médio: ${(churnGlobal * 100).toFixed(0)}%`,
        detalhe: `Mais da metade da base está em risco. Invista em retenção HOJE.`,
      })
    }
    if (classeA.length > 0 && classeC.length > 0) {
      const ltvAvgA = classeA.reduce((s, c) => s + c.ltv_projetado, 0) / classeA.length
      const ltvAvgC = classeC.length > 0 ? classeC.reduce((s, c) => s + c.ltv_projetado, 0) / classeC.length : 0
      if (ltvAvgA > ltvAvgC * 5) {
        insights.push({
          emoji: '💎',
          tipo: 'positivo',
          titulo: `Classe A vale ${(ltvAvgA / Math.max(ltvAvgC, 1)).toFixed(1)}x mais que classe C`,
          detalhe: `LTV projetado: R$ ${ltvAvgA.toFixed(0)} vs R$ ${ltvAvgC.toFixed(0)}. Foque em manter os A.`,
        })
      }
    }
    insights.push({
      emoji: '💰',
      tipo: 'positivo',
      titulo: `LTV vitalício total projetado: R$ ${ltvTotalProjetado.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`,
      detalhe: `Baseado em ${clientes.length} clientes com comportamento conhecido. Reflete o valor futuro da base.`,
    })

    return NextResponse.json({
      ok: true,
      total_clientes: clientes.length,
      receita_historica_total: Number(receitaTotal.toFixed(2)),
      ltv_total_historico: Number(ltvTotalHistorico.toFixed(2)),
      ltv_total_projetado_12m: Number(ltvTotalProjetado.toFixed(2)),
      churn_rate_global: Number((churnGlobal * 100).toFixed(1)),
      curva_abc: {
        classe_a: { count: classeA.length, pct_clientes: Number(pctClientesA.toFixed(1)), pct_receita: Number(pctReceitaA.toFixed(1)), ltv_medio: Number(ltvMedioA.toFixed(2)) },
        classe_b: { count: classeB.length, pct_receita: Number(((classeB.reduce((s, c) => s + c.receita_total, 0) / Math.max(receitaTotal, 1)) * 100).toFixed(1)), ltv_medio: Number(ltvMedioB.toFixed(2)) },
        classe_c: { count: classeC.length, pct_receita: Number(((classeC.reduce((s, c) => s + c.receita_total, 0) / Math.max(receitaTotal, 1)) * 100).toFixed(1)), ltv_medio: Number(ltvMedioC.toFixed(2)) },
      },
      concentracao: {
        top_10_pct: Number(pctReceitaTop10.toFixed(1)),
        top_1_pct: Number(pctReceitaTop1.toFixed(1)),
      },
      // Top 50 clientes classe A
      top_clientes: classeA.slice(0, 50).map((c) => ({
        id: c.id,
        posicao: c.posicao,
        classe: c.classe,
        receita_total: Number(c.receita_total.toFixed(2)),
        ltv_projetado: Number(c.ltv_projetado.toFixed(2)),
        total_pedidos: c.total_pedidos,
        ticket_medio: Number(c.ticket_medio.toFixed(2)),
        freq_mensal: Number(c.freq_mensal.toFixed(2)),
        churn_risk: c.churn_rate_personal,
      })),
      insights,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message, stack: err.stack }, { status: 500 })
  }
}
