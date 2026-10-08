// GET /api/admin/relatorios/cohort
// Análise de cohort: agrupa clientes pelo mês da 1ª compra e mede retenção nos meses seguintes
// Retorna matriz: cohort_mes | total_clientes | M0% | M1% | M2% | M3% | ...
// Mais: LTV médio por cohort, ticket médio, churn rate

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const meses = Math.min(Number(searchParams.get('meses') || 12), 24)

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

    // Agrupa por cohort (mês da 1ª compra)
    const cohorts = new Map<string, {
      cohort: string
      cohortDate: Date
      clientes: Set<string>
      orders: { mes: number; total: number; receita: number; clientesUnicos: Set<string> }[]
      receita_total: number
      total_pedidos: number
    }>()

    const horizonteMeses = 12
    const hoje = new Date()

    for (const c of customers) {
      if (c.orders.length === 0) continue
      const primeira = new Date(c.orders[0].created_at!)
      const cohortKey = `${primeira.getFullYear()}-${String(primeira.getMonth() + 1).padStart(2, '0')}`
      if (!cohorts.has(cohortKey)) {
        cohorts.set(cohortKey, {
          cohort: cohortKey,
          cohortDate: new Date(primeira.getFullYear(), primeira.getMonth(), 1),
          clientes: new Set(),
          orders: Array.from({ length: horizonteMeses }, (_, i) => ({ mes: i, total: 0, receita: 0, clientesUnicos: new Set() })),
          receita_total: 0,
          total_pedidos: 0,
        })
      }
      const c_data = cohorts.get(cohortKey)!
      c_data.clientes.add(c.id)
      c_data.receita_total += c.orders.reduce((s, o) => s + Number(o.total || 0), 0)
      c_data.total_pedidos += c.orders.length

      // Agrupa orders por mês relativo ao cohort
      for (const o of c.orders) {
        const orderDate = new Date(o.created_at!)
        const mesesApos = (orderDate.getFullYear() - primeira.getFullYear()) * 12 + (orderDate.getMonth() - primeira.getMonth())
        if (mesesApos >= 0 && mesesApos < horizonteMeses) {
          c_data.orders[mesesApos].total++
          c_data.orders[mesesApos].receita += Number(o.total || 0)
          c_data.orders[mesesApos].clientesUnicos.add(c.id)
        }
      }
    }

    // Monta matriz
    const cohortsOrdenados = Array.from(cohorts.values())
      .filter((c) => c.cohortDate <= hoje)
      .sort((a, b) => a.cohortDate.getTime() - b.cohortDate.getTime())
      .slice(-meses)

    const matriz = cohortsOrdenados.map((c) => {
      const row: any = {
        cohort: c.cohort,
        total_clientes: c.clientes.size,
        receita_total: Number(c.receita_total.toFixed(2)),
        ticket_medio: c.total_pedidos > 0 ? Number((c.receita_total / c.total_pedidos).toFixed(2)) : 0,
        retencao: [],
      }
      c.orders.forEach((m, idx) => {
        const pct = c.clientes.size > 0 ? (m.clientesUnicos.size / c.clientes.size) * 100 : 0
        row.retencao.push({
          mes: idx,
          pedidos: m.total,
          clientes_unicos: m.clientesUnicos.size,
          receita: Number(m.receita.toFixed(2)),
          retencao_pct: Number(pct.toFixed(1)),
        })
      })
      return row
    })

    // KPIs resumo
    const totalClientes = cohortsOrdenados.reduce((s, c) => s + c.clientes.size, 0)
    const mediaRetencaoM1 = matriz.filter((m) => m.retencao.length > 1).reduce((s, m) => s + m.retencao[1].retencao_pct, 0) / Math.max(1, matriz.filter((m) => m.retencao.length > 1).length)
    const mediaRetencaoM3 = matriz.filter((m) => m.retencao.length > 3).reduce((s, m) => s + m.retencao[3].retencao_pct, 0) / Math.max(1, matriz.filter((m) => m.retencao.length > 3).length)
    const mediaRetencaoM6 = matriz.filter((m) => m.retencao.length > 6).reduce((s, m) => s + m.retencao[6].retencao_pct, 0) / Math.max(1, matriz.filter((m) => m.retencao.length > 6).length)
    const mediaRetencaoM12 = matriz.filter((m) => m.retencao.length > 11).reduce((s, m) => s + m.retencao[11].retencao_pct, 0) / Math.max(1, matriz.filter((m) => m.retencao.length > 11).length)

    // Melhor e pior cohort por retenção M1
    const cohortsComM1 = matriz.filter((m) => m.retencao.length > 1)
    let melhorCohort = cohortsComM1[0]
    let piorCohort = cohortsComM1[0]
    for (const m of cohortsComM1) {
      if (m.retencao[1].retencao_pct > (melhorCohort?.retencao[1]?.retencao_pct || 0)) melhorCohort = m
      if (m.retencao[1].retencao_pct < (piorCohort?.retencao[1]?.retencao_pct || 100)) piorCohort = m
    }

    const insights: any[] = []
    if (mediaRetencaoM1 > 0) {
      insights.push({
        emoji: '📈',
        tipo: mediaRetencaoM1 > 30 ? 'positivo' : 'atencao',
        titulo: `Retenção média M1: ${mediaRetencaoM1.toFixed(0)}%`,
        detalhe: `${(100 - mediaRetencaoM1).toFixed(0)}% dos clientes não voltam no 2º mês. Crítico pra LTV.`,
      })
    }
    if (mediaRetencaoM6 > 0) {
      insights.push({
        emoji: '📊',
        tipo: 'info',
        titulo: `Retenção média M6: ${mediaRetencaoM6.toFixed(0)}%`,
        detalhe: `Após 6 meses, ${mediaRetencaoM6.toFixed(0)}% dos clientes ainda estão ativos.`,
      })
    }
    if (melhorCohort && cohortsComM1.length > 1) {
      insights.push({
        emoji: '🏆',
        tipo: 'positivo',
        titulo: `Melhor cohort: ${melhorCohort.cohort} (${melhorCohort.retencao[1].retencao_pct.toFixed(0)}% M1)`,
        detalhe: `${melhorCohort.total_clientes} clientes. Ticket médio R$ ${melhorCohort.ticket_medio.toFixed(2)}.`,
      })
    }
    if (piorCohort && melhorCohort && piorCohort !== melhorCohort) {
      insights.push({
        emoji: '⚠️',
        tipo: 'atencao',
        titulo: `Pior cohort: ${piorCohort.cohort} (${piorCohort.retencao[1].retencao_pct.toFixed(0)}% M1)`,
        detalhe: `Investigue o que aconteceu nesse mês. Pode ter sido problema operacional.`,
      })
    }
    if (mediaRetencaoM12 > 0) {
      insights.push({
        emoji: '💎',
        tipo: 'positivo',
        titulo: `Retenção M12: ${mediaRetencaoM12.toFixed(0)}%`,
        detalhe: `Clientes que ficam por 1 ano. Base sólida pra recorrência.`,
      })
    }

    return NextResponse.json({
      ok: true,
      total_cohorts: matriz.length,
      total_clientes: totalClientes,
      retencao_media: {
        m1: Number(mediaRetencaoM1.toFixed(1)),
        m3: Number(mediaRetencaoM3.toFixed(1)),
        m6: Number(mediaRetencaoM6.toFixed(1)),
        m12: Number(mediaRetencaoM12.toFixed(1)),
      },
      matriz,
      insights,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message, stack: err.stack }, { status: 500 })
  }
}
