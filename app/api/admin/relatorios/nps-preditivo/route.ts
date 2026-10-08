// GET /api/admin/relatorios/nps-preditivo
// NPS Preditivo: score 0-10 baseado em comportamento
// Modelo: pontuação baseada em:
// - Frequência de compra (+)
// - Tempo desde última compra (-)
// - Ticket médio (+)
// - Cancelamentos/devoluções (-)
// - LTV (+)
// Classifica: Promotor (9-10), Neutro (7-8), Detrator (0-6)

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    const customers = await prisma.customers.findMany({
      where: { orders: { some: {} } },
      select: {
        id: true,
        nome: true,
        email: true,
        telefone: true,
        orders: {
          select: { id: true, total: true, created_at: true, status: true },
        },
      },
    })

    const hoje = new Date()

    type NpsCliente = {
      id: string; nome: string; email: string | null; telefone: string | null
      score: number
      categoria: 'promotor' | 'neutro' | 'detrator'
      nps_pontos: number // 0-10
      total_pedidos: number
      pedidos_validos: number
      cancelamentos: number
      receita_total: number
      ticket_medio: number
      dias_desde_ultima: number
      ultima_compra: string
      freq_mensal: number
      ltv: number
      detalhes: { sinal: string; impacto: number; descricao: string }[]
    }

    const clientes: NpsCliente[] = []

    for (const c of customers) {
      if (c.orders.length === 0) continue
      const ultima = new Date(c.orders.sort((a, b) => new Date(b.created_at!).getTime() - new Date(a.created_at!).getTime())[0].created_at!)
      const diasDesde = Math.floor((hoje.getTime() - ultima.getTime()) / 86400000)
      const receitaTotal = c.orders.reduce((s, o) => s + Number(o.total || 0), 0)
      const ticket = receitaTotal / c.orders.length
      const cancelamentos = c.orders.filter((o) => o.status === 'cancelado').length
      const validos = c.orders.length - cancelamentos
      const diasAtivo = Math.max(1, (ultima.getTime() - new Date(c.orders[c.orders.length - 1].created_at!).getTime()) / 86400000)
      const freqMensal = c.orders.length / Math.max(1, diasAtivo / 30)
      const ltv = receitaTotal

      // Calcula score (0-10)
      let score = 5 // base
      const detalhes: NpsCliente['detalhes'] = []

      // 1) Frequência (peso 2): +2 se freq>=1/mês, +1 se >=0.5
      if (freqMensal >= 1) { score += 2; detalhes.push({ sinal: '+', impacto: 2, descricao: 'Compra todo mês' }) }
      else if (freqMensal >= 0.5) { score += 1; detalhes.push({ sinal: '+', impacto: 1, descricao: 'Compra 1+ vez a cada 2 meses' }) }
      else { score -= 1; detalhes.push({ sinal: '-', impacto: 1, descricao: 'Compra raramente' }) }

      // 2) Recência (peso 2)
      if (diasDesde < 30) { score += 2; detalhes.push({ sinal: '+', impacto: 2, descricao: 'Comprou nos últimos 30d' }) }
      else if (diasDesde < 60) { score += 1; detalhes.push({ sinal: '+', impacto: 1, descricao: 'Comprou nos últimos 60d' }) }
      else if (diasDesde < 90) { score -= 1; detalhes.push({ sinal: '-', impacto: 1, descricao: '60-90d sem comprar' }) }
      else { score -= 2; detalhes.push({ sinal: '-', impacto: 2, descricao: `${diasDesde}d sem comprar` }) }

      // 3) Cancelamentos (peso 1): -1 se teve algum
      if (cancelamentos > 0) {
        const taxaCanc = cancelamentos / c.orders.length
        if (taxaCanc > 0.3) { score -= 2; detalhes.push({ sinal: '-', impacto: 2, descricao: `${(taxaCanc * 100).toFixed(0)}% de cancelamento` }) }
        else { score -= 1; detalhes.push({ sinal: '-', impacto: 1, descricao: `${cancelamentos} cancelamento(s)` }) }
      }

      // 4) Ticket médio (peso 1): +1 se > R$100
      if (ticket > 200) { score += 1; detalhes.push({ sinal: '+', impacto: 1, descricao: 'Ticket alto' }) }
      else if (ticket > 100) { score += 0.5; detalhes.push({ sinal: '+', impacto: 0.5, descricao: 'Ticket médio-alto' }) }

      // 5) LTV (peso 1)
      if (ltv > 1000) { score += 1; detalhes.push({ sinal: '+', impacto: 1, descricao: 'LTV > R$1000' }) }
      else if (ltv > 500) { score += 0.5; detalhes.push({ sinal: '+', impacto: 0.5, descricao: 'LTV > R$500' }) }

      // 6) Total pedidos (peso 0.5): cliente recorrente
      if (validos >= 5) { score += 0.5; detalhes.push({ sinal: '+', impacto: 0.5, descricao: 'Cliente recorrente' }) }

      // Limita 0-10
      score = Math.max(0, Math.min(10, score))

      let categoria: NpsCliente['categoria']
      if (score >= 9) categoria = 'promotor'
      else if (score >= 7) categoria = 'neutro'
      else categoria = 'detrator'

      clientes.push({
        id: c.id,
        nome: c.nome || 'Sem nome',
        email: c.email,
        telefone: c.telefone,
        score: Math.round(score * 10) / 10,
        categoria,
        nps_pontos: Math.round(score * 10) / 10,
        total_pedidos: c.orders.length,
        pedidos_validos: validos,
        cancelamentos,
        receita_total: Number(receitaTotal.toFixed(2)),
        ticket_medio: Number(ticket.toFixed(2)),
        dias_desde_ultima: diasDesde,
        ultima_compra: ultima.toISOString(),
        freq_mensal: Number(freqMensal.toFixed(2)),
        ltv: Number(ltv.toFixed(2)),
        detalhes,
      })
    }

    // Calcula NPS
    const total = clientes.length
    const promotores = clientes.filter((c) => c.categoria === 'promotor')
    const neutros = clientes.filter((c) => c.categoria === 'neutro')
    const detratores = clientes.filter((c) => c.categoria === 'detrator')
    const nps = total > 0 ? Math.round(((promotores.length / total) * 100) - ((detratores.length / total) * 100)) : 0

    // Ordena por score (maior primeiro)
    clientes.sort((a, b) => b.score - a.score)

    // Ticket médio por categoria
    const ticketMedioPromotor = promotores.length > 0 ? promotores.reduce((s, c) => s + c.ticket_medio, 0) / promotores.length : 0
    const ticketMedioDetrator = detratores.length > 0 ? detratores.reduce((s, c) => s + c.ticket_medio, 0) / detratores.length : 0
    const ltvPromotor = promotores.length > 0 ? promotores.reduce((s, c) => s + c.ltv, 0) / promotores.length : 0
    const ltvDetrator = detratores.length > 0 ? detratores.reduce((s, c) => s + c.ltv, 0) / detratores.length : 0

    const insights: any[] = []
    if (nps >= 50) {
      insights.push({ emoji: '🏆', tipo: 'positivo', titulo: `NPS ${nps} — EXCELENTE!`, detalhe: `${promotores.length} promotores vs ${detratores.length} detratores. Marca forte.` })
    } else if (nps >= 0) {
      insights.push({ emoji: '⚠️', tipo: 'atencao', titulo: `NPS ${nps} — Zona de risco`, detalhe: `Mais ou menos igualado. Foque em converter neutros em promotores.` })
    } else {
      insights.push({ emoji: '💔', tipo: 'atencao', titulo: `NPS ${nps} — CRÍTICO`, detalhe: `Mais detratores que promotores. Risco de churn em massa.` })
    }
    if (ltvPromotor > 0 && ltvDetrator > 0) {
      insights.push({
        emoji: '💎',
        tipo: 'positivo',
        titulo: `Promotores valem ${(ltvPromotor / Math.max(ltvDetrator, 1)).toFixed(1)}x mais`,
        detalhe: `LTV médio: R$ ${ltvPromotor.toFixed(0)} (promotor) vs R$ ${ltvDetrator.toFixed(0)} (detrator). Foque em manter os promotores.`,
      })
    }
    const detratoresAltoValor = detratores.filter((d) => d.ltv > 500).slice(0, 5)
    if (detratoresAltoValor.length > 0) {
      insights.push({
        emoji: '🚨',
        tipo: 'atencao',
        titulo: `${detratoresAltoValor.length} detratores de ALTO valor`,
        detalhe: `LTV > R$500. Acione URGENTE antes que churnem.`,
      })
    }

    return NextResponse.json({
      ok: true,
      nps,
      total_clientes: total,
      promotores: promotores.length,
      neutros: neutros.length,
      detratores: detratores.length,
      pct_promotores: total > 0 ? Number(((promotores.length / total) * 100).toFixed(1)) : 0,
      pct_neutros: total > 0 ? Number(((neutros.length / total) * 100).toFixed(1)) : 0,
      pct_detratores: total > 0 ? Number(((detratores.length / total) * 100).toFixed(1)) : 0,
      ticket_medio_promotor: Number(ticketMedioPromotor.toFixed(2)),
      ticket_medio_detrator: Number(ticketMedioDetrator.toFixed(2)),
      ltv_promotor: Number(ltvPromotor.toFixed(2)),
      ltv_detrator: Number(ltvDetrator.toFixed(2)),
      clientes,
      insights,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message, stack: err.stack }, { status: 500 })
  }
}
