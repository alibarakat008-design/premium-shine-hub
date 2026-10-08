// GET /api/admin/relatorios/rfm
// Segmentação RFM clássica: Recency, Frequency, Monetary
// - Calcula quintis (1-5) pra cada métrica
// - Cria 11 segmentos: Champions, Loyal, Potential Loyalists, Recent, Promising,
//   Need Attention, About to Sleep, At Risk, Can't Lose, Hibernating, Lost
// - Recomenda ação de marketing pra cada segmento

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface RFM {
  id: string
  nome: string
  email: string | null
  telefone: string | null
  recency_days: number
  frequency: number
  monetary: number
  r: number
  f: number
  m: number
  r_score: number
  f_score: number
  m_score: number
  rfm_score: string // ex: "555"
  segment: string
  acao: string
}

function getSegment(r: number, f: number, m: number): { name: string; acao: string; cor: string } {
  if (r >= 4 && f >= 4 && m >= 4) return { name: '🏆 Champions', acao: 'Recompense: programa VIP, produtos exclusivos,新品優先', cor: '#10b981' }
  if (r >= 3 && f >= 3 && m >= 3 && r >= 4) return { name: '💎 Loyal Customers', acao: 'Cross-sell / Up-sell produtos premium', cor: '#3b82f6' }
  if (r >= 4 && f <= 2) return { name: '🌟 New Customers', acao: 'Onboarding, apresentação da marca', cor: '#8b5cf6' }
  if (r >= 3 && f >= 3 && m <= 2) return { name: '🤝 Potential Loyalists', acao: 'Programa de fidelidade, segundo produto', cor: '#06b6d4' }
  if (r >= 3 && f <= 1) return { name: '🌱 Promising', acao: 'Cupom de 2ª compra, e-mail boas-vindas', cor: '#a78bfa' }
  if (r === 3 && f >= 2 && f <= 3) return { name: '⚠️ Need Attention', acao: 'Cupom de reativação limitado, recomendações', cor: '#f59e0b' }
  if (r === 2 && f >= 2) return { name: '😴 About to Sleep', acao: 'Reativar com desconto agressivo', cor: '#f97316' }
  if (r <= 2 && f >= 4 && m >= 4) return { name: '🚨 Can\'t Lose Them', acao: 'WHATSAPP DIRETO + 20% OFF, salvar LTV alto', cor: '#dc2626' }
  if (r <= 2 && f >= 3 && m >= 3) return { name: '💔 At Risk', acao: 'Campanha de reativação urgente', cor: '#ef4444' }
  if (r <= 2 && f <= 2 && m >= 3) return { name: '🪦 Hibernating (high value)', acao: 'Reativar com combo de marca favorita', cor: '#6b7280' }
  if (r === 1 && f <= 1) return { name: '🪦 Lost', acao: 'Arquivar ou tentar 1x mais com grande desconto', cor: '#9ca3af' }
  return { name: '👀 Others', acao: 'Monitorar', cor: '#9ca3af' }
}

export async function GET(req: NextRequest) {
  try {
    const customers = await prisma.customers.findMany({
      where: { orders: { some: { status: { not: 'cancelado' } } } },
      select: {
        id: true,
        nome: true,
        email: true,
        telefone: true,
        orders: {
          where: { status: { not: 'cancelado' } },
          select: { total: true, created_at: true },
        },
      },
    })

    const hoje = new Date()
    type CustomerRaw = {
      id: string; nome: string; email: string | null; telefone: string | null
      recency: number; frequency: number; monetary: number
    }
    const raw: CustomerRaw[] = []

    for (const c of customers) {
      if (c.orders.length === 0) continue
      const ultimaCompra = new Date(c.orders[0].created_at!).getTime()
      const recency = Math.floor((hoje.getTime() - ultimaCompra) / 86400000)
      const frequency = c.orders.length
      const monetary = c.orders.reduce((s, o) => s + Number(o.total || 0), 0)
      raw.push({ id: c.id, nome: c.nome || 'Sem nome', email: c.email, telefone: c.telefone, recency, frequency, monetary })
    }

    if (raw.length === 0) {
      return NextResponse.json({ ok: true, total: 0, segmentos: {}, clientes: [] })
    }

    // Calcula quintis (1-5, onde 5 é melhor)
    // Recency: menor = melhor → inverte
    const recencies = raw.map((c) => c.recency).sort((a, b) => a - b)
    const frequencies = raw.map((c) => c.frequency).sort((a, b) => a - b)
    const monetaries = raw.map((c) => c.monetary).sort((a, b) => a - b)

    const quintil = (sorted: number[], val: number, invert = false): number => {
      const n = sorted.length
      const pos = sorted.findIndex((s) => s >= val)
      if (pos === -1) return invert ? 1 : 5
      const q = Math.min(4, Math.floor((pos / n) * 5))
      return invert ? 5 - q : q + 1
    }

    const enriched: RFM[] = raw.map((c) => {
      const r = quintil(recencies, c.recency, true) // invert: menor recency = maior score
      const f = quintil(frequencies, c.frequency, false)
      const m = quintil(monetaries, c.monetary, false)
      const seg = getSegment(r, f, m)
      return {
        id: c.id,
        nome: c.nome,
        email: c.email,
        telefone: c.telefone,
        recency_days: c.recency,
        frequency: c.frequency,
        monetary: Number(c.monetary.toFixed(2)),
        r, f, m,
        r_score: r, f_score: f, m_score: m,
        rfm_score: `${r}${f}${m}`,
        segment: seg.name,
        acao: seg.acao,
      }
    })

    enriched.sort((a, b) => b.m - a.m || b.r - a.r || b.f - a.f)

    // Resumo por segmento
    const segmentCounts: Record<string, { count: number; monetary: number; avg_recency: number }> = {}
    for (const c of enriched) {
      const seg = c.segment
      if (!segmentCounts[seg]) segmentCounts[seg] = { count: 0, monetary: 0, avg_recency: 0 }
      segmentCounts[seg].count++
      segmentCounts[seg].monetary += c.monetary
      segmentCounts[seg].avg_recency += c.recency_days
    }
    for (const seg of Object.keys(segmentCounts)) {
      segmentCounts[seg].monetary = Number(segmentCounts[seg].monetary.toFixed(2))
      segmentCounts[seg].avg_recency = Math.round(segmentCounts[seg].avg_recency / segmentCounts[seg].count)
    }

    // Insights
    const insights: any[] = []
    const champions = enriched.filter((c) => c.segment.includes('Champions'))
    if (champions.length > 0) {
      const receita = champions.reduce((s, c) => s + c.monetary, 0)
      insights.push({
        emoji: '🏆',
        tipo: 'positivo',
        titulo: `${champions.length} Champions`,
        detalhe: `Receita total R$ ${receita.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}. Recompense com produtos exclusivos.`,
      })
    }
    const atRisk = enriched.filter((c) => c.segment.includes('At Risk') || c.segment.includes('Can\'t Lose'))
    if (atRisk.length > 0) {
      const receita = atRisk.reduce((s, c) => s + c.monetary, 0)
      insights.push({
        emoji: '🚨',
        tipo: 'atencao',
        titulo: `${atRisk.length} clientes de ALTO VALOR em risco`,
        detalhe: `LTV total em risco: R$ ${receita.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}. Ação urgente via WhatsApp.`,
      })
    }
    const hibernating = enriched.filter((c) => c.segment.includes('Hibernating') || c.segment.includes('Lost'))
    if (hibernating.length > 0) {
      const pct = (hibernating.length / enriched.length) * 100
      insights.push({
        emoji: '🪦',
        tipo: 'info',
        titulo: `${hibernating.length} clientes hibernando/perdidos (${pct.toFixed(0)}%)`,
        detalhe: `Tentativa de reativação com combo de marca favorita ou 30% OFF.`,
      })
    }
    const loyal = enriched.filter((c) => c.segment.includes('Loyal'))
    if (loyal.length > 0) {
      insights.push({
        emoji: '💎',
        tipo: 'positivo',
        titulo: `${loyal.length} Loyal Customers`,
        detalhe: `Já compraram várias vezes. Foque em up-sell e cross-sell.`,
      })
    }
    const newCust = enriched.filter((c) => c.segment.includes('New'))
    if (newCust.length > 0) {
      insights.push({
        emoji: '🌟',
        tipo: 'positivo',
        titulo: `${newCust.length} novos clientes`,
        detalhe: `Compraram pela 1ª vez recentemente. Onboarding e cupom de 2ª compra.`,
      })
    }

    return NextResponse.json({
      ok: true,
      total: enriched.length,
      segmentos: segmentCounts,
      clientes: enriched,
      insights,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message, stack: err.stack }, { status: 500 })
  }
}
