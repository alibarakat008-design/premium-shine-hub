// GET /api/admin/relatorios/churn
// Análise de churn de clientes
// - Classifica clientes em: Ativo, Em risco, Churn, Dormindo, Perdido
// - Calcula LTV, ticket médio, dias sem comprar
// - Risco de churn estimado
// - Lista top clientes em risco por LTV (pra focar reativação)

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const segment = searchParams.get('segment') // 'ativo' | 'risco' | 'churn' | 'dormindo' | 'perdido' | 'todos'
    const search = searchParams.get('search')?.toLowerCase() || ''
    const limit = Math.min(Number(searchParams.get('limit') || 200), 1000)

    // Buscar todos os clientes com pelo menos 1 pedido
    const customers = await prisma.customers.findMany({
      where: {
        orders: { some: {} },
      },
      select: {
        id: true,
        nome: true,
        email: true,
        telefone: true,
        created_at: true,
        orders: {
          where: { status: { not: 'cancelado' } },
          orderBy: { created_at: 'desc' },
          select: { id: true, total: true, created_at: true, status: true },
        },
      },
    })

    const hoje = new Date()
    const trintaDias = new Date(hoje.getTime() - 30 * 86400000)
    const sessentaDias = new Date(hoje.getTime() - 60 * 86400000)
    const noventaDias = new Date(hoje.getTime() - 90 * 86400000)
    const centoOitentaDias = new Date(hoje.getTime() - 180 * 86400000)

    type CustomerAnalysis = {
      id: string
      nome: string
      email: string | null
      telefone: string | null
      total_pedidos: number
      receita_total: number
      ticket_medio: number
      primeira_compra: string
      ultima_compra: string
      dias_sem_comprar: number
      media_dias_entre_compras: number
      segment: 'ativo' | 'risco' | 'churn' | 'dormindo' | 'perdido'
      risco_churn_pct: number
      ltv_estimado: number
      freq_mensal: number
    }

    const allCustomers: CustomerAnalysis[] = []
    const segmentCounts: Record<string, number> = { ativo: 0, risco: 0, churn: 0, dormindo: 0, perdido: 0 }
    const segmentReceita: Record<string, number> = { ativo: 0, risco: 0, churn: 0, dormindo: 0, perdido: 0 }

    for (const c of customers) {
      if (c.orders.length === 0) continue
      const ultimaCompra = new Date(c.orders[0].created_at!)
      const primeiraCompra = new Date(c.orders[c.orders.length - 1].created_at!)
      const diasSemComprar = Math.floor((hoje.getTime() - ultimaCompra.getTime()) / 86400000)
      const receitaTotal = c.orders.reduce((s, o) => s + Number(o.total || 0), 0)
      const ticketMedio = c.orders.length > 0 ? receitaTotal / c.orders.length : 0

      // Calcula frequência média em dias
      let mediaDias = 0
      if (c.orders.length > 1) {
        const diasTotais = (ultimaCompra.getTime() - primeiraCompra.getTime()) / 86400000
        mediaDias = diasTotais / (c.orders.length - 1)
      }

      // Classifica
      let seg: CustomerAnalysis['segment']
      if (diasSemComprar < 30) seg = 'ativo'
      else if (diasSemComprar < 60) seg = 'risco'
      else if (diasSemComprar < 90) seg = 'churn'
      else if (diasSemComprar < 180) seg = 'dormindo'
      else seg = 'perdido'

      // Risco de churn: baseado em dias sem comprar vs frequência
      let riscoPct = 0
      if (mediaDias > 0) {
        riscoPct = Math.min(100, (diasSemComprar / (mediaDias * 2)) * 100)
      } else {
        riscoPct = diasSemComprar > 60 ? 100 : diasSemComprar > 30 ? 50 : 0
      }

      // LTV estimado: receita_total + projeção de receita futura baseada na frequência
      let ltv = receitaTotal
      if (seg === 'ativo' && mediaDias > 0) {
        const mesesRestantes = 12 // 1 ano de projeção
        const comprasPorMes = 30 / mediaDias
        ltv += ticketMedio * comprasPorMes * mesesRestantes
      }

      // Frequência mensal
      const mesesAtivo = Math.max(1, (hoje.getTime() - primeiraCompra.getTime()) / (30 * 86400000))
      const freqMensal = c.orders.length / mesesAtivo

      segmentCounts[seg]++
      segmentReceita[seg] += receitaTotal

      allCustomers.push({
        id: c.id,
        nome: c.nome || 'Sem nome',
        email: c.email,
        telefone: c.telefone,
        total_pedidos: c.orders.length,
        receita_total: Number(receitaTotal.toFixed(2)),
        ticket_medio: Number(ticketMedio.toFixed(2)),
        primeira_compra: primeiraCompra.toISOString(),
        ultima_compra: ultimaCompra.toISOString(),
        dias_sem_comprar: diasSemComprar,
        media_dias_entre_compras: Number(mediaDias.toFixed(1)),
        segment: seg,
        risco_churn_pct: Number(riscoPct.toFixed(0)),
        ltv_estimado: Number(ltv.toFixed(2)),
        freq_mensal: Number(freqMensal.toFixed(2)),
      })
    }

    // Filtra
    let filtered = allCustomers
    if (segment && segment !== 'todos') filtered = filtered.filter((c) => c.segment === segment)
    if (search) {
      filtered = filtered.filter((c) => c.nome.toLowerCase().includes(search) || (c.email || '').toLowerCase().includes(search))
    }

    // Ordena por LTV (mais valiosos primeiro)
    filtered.sort((a, b) => b.ltv_estimado - a.ltv_estimado)

    const top = filtered.slice(0, limit)

    // Resumo
    const totalClientes = allCustomers.length
    const ltvTotalAtivos = allCustomers.filter((c) => c.segment === 'ativo').reduce((s, c) => s + c.ltv_estimado, 0)
    const ltvTotalEmRisco = allCustomers.filter((c) => c.segment === 'risco').reduce((s, c) => s + c.ltv_estimado, 0)
    const ltvTotalChurn = allCustomers.filter((c) => c.segment === 'churn' || c.segment === 'dormindo' || c.segment === 'perdido').reduce((s, c) => s + c.ltv_estimado, 0)
    const receitaEmRisco = allCustomers.filter((c) => c.segment === 'risco').reduce((s, c) => s + c.receita_total, 0)

    const insights: any[] = []
    if (totalClientes > 0) {
      const pctAtivo = (segmentCounts.ativo / totalClientes) * 100
      const pctEmRisco = (segmentCounts.risco / totalClientes) * 100
      const pctChurn = ((segmentCounts.churn + segmentCounts.dormindo + segmentCounts.perdido) / totalClientes) * 100

      if (pctEmRisco > 10) {
        insights.push({
          emoji: '⚠️',
          tipo: 'atencao',
          titulo: `${segmentCounts.risco} clientes em risco (${pctEmRisco.toFixed(0)}%)`,
          detalhe: `LTV em risco: R$ ${ltvTotalEmRisco.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}. Aja rápido: campanha WhatsApp com desconto personalizado.`,
        })
      }
      if (pctChurn > 30) {
        insights.push({
          emoji: '💔',
          tipo: 'atencao',
          titulo: `${pctChurn.toFixed(0)}% dos clientes já churned`,
          detalhe: `${segmentCounts.churn + segmentCounts.dormindo + segmentCounts.perdido} clientes inativos. Foque em reativar os "dormindo" (60-180 dias).`,
        })
      }
      if (pctAtivo > 50) {
        insights.push({
          emoji: '✅',
          tipo: 'positivo',
          titulo: `${pctAtivo.toFixed(0)}% dos clientes ativos`,
          detalhe: `Boa retenção! LTV total projetado: R$ ${ltvTotalAtivos.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`,
        })
      }
      // Top cliente em risco
      const topRisco = allCustomers.filter((c) => c.segment === 'risco').sort((a, b) => b.ltv_estimado - a.ltv_estimado)[0]
      if (topRisco) {
        insights.push({
          emoji: '🎯',
          tipo: 'info',
          titulo: `Top cliente em risco: ${topRisco.nome}`,
          detalhe: `LTV R$ ${topRisco.ltv_estimado.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}, ${topRisco.dias_sem_comprar} dias sem comprar. Acionar agora!`,
        })
      }
    }

    return NextResponse.json({
      ok: true,
      total_clientes: totalClientes,
      segment_counts: segmentCounts,
      segment_receita: Object.fromEntries(Object.entries(segmentReceita).map(([k, v]) => [k, Number(v.toFixed(2))])),
      ltv_total_ativos: Number(ltvTotalAtivos.toFixed(2)),
      ltv_total_em_risco: Number(ltvTotalEmRisco.toFixed(2)),
      ltv_total_churn: Number(ltvTotalChurn.toFixed(2)),
      receita_em_risco: Number(receitaEmRisco.toFixed(2)),
      clientes: top,
      insights,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message, stack: err.stack }, { status: 500 })
  }
}
