// GET /api/admin/relatorios/previsao-recompra?limit=200&segment=ativo
// Prevê quando cada cliente deve voltar a comprar
// Baseado em: padrão de compras, intervalo médio, desvio padrão, sazonalidade
// Retorna: dias previstos pra próxima compra, probabilidade de voltar, melhor dia/horário

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const limit = Math.min(Number(searchParams.get('limit') || 200), 1000)
    const segment = searchParams.get('segment') // 'ativo' | 'risco' | 'todos'

    const customers = await prisma.customers.findMany({
      where: { orders: { some: { status: { not: 'cancelado' } } } },
      select: {
        id: true,
        nome: true,
        email: true,
        telefone: true,
        orders: {
          where: { status: { not: 'cancelado' } },
          orderBy: { created_at: 'asc' },
          select: { id: true, total: true, created_at: true },
        },
      },
    })

    type Prev = {
      id: string
      nome: string
      email: string | null
      telefone: string | null
      total_pedidos: number
      receita_total: number
      ultima_compra: string
      dias_desde_ultima: number
      intervalo_medio_dias: number
      desvio_padrao_dias: number
      proxima_compra_prevista: string
      dias_ate_proxima: number
      probabilidade_voltar_pct: number
      confianca: 'alta' | 'media' | 'baixa'
      melhor_dia_semana: string
      melhor_periodo: string
      urgencia: 'atrasado' | 'hoje' | 'em_breve' | 'normal' | 'novo'
      status: 'ativo' | 'risco' | 'churn'
    }

    const hoje = new Date()
    const previsoes: Prev[] = []

    for (const c of customers) {
      if (c.orders.length === 0) continue
      const ultima = new Date(c.orders[c.orders.length - 1].created_at!)
      const diasDesde = Math.floor((hoje.getTime() - ultima.getTime()) / 86400000)
      const receitaTotal = c.orders.reduce((s, o) => s + Number(o.total || 0), 0)

      // Status
      let status: Prev['status']
      if (diasDesde < 30) status = 'ativo'
      else if (diasDesde < 60) status = 'risco'
      else status = 'churn'

      if (segment !== 'todos' && status !== segment) continue

      // Calcula intervalo médio (entre compras)
      let intervaloMedio = 0
      let desvio = 0
      if (c.orders.length >= 2) {
        const intervalos: number[] = []
        for (let i = 1; i < c.orders.length; i++) {
          const t1 = new Date(c.orders[i - 1].created_at!).getTime()
          const t2 = new Date(c.orders[i].created_at!).getTime()
          intervalos.push((t2 - t1) / 86400000)
        }
        intervaloMedio = intervalos.reduce((s, i) => s + i, 0) / intervalos.length
        // Desvio padrão
        const variancia = intervalos.reduce((s, i) => s + Math.pow(i - intervaloMedio, 2), 0) / intervalos.length
        desvio = Math.sqrt(variancia)
      }

      // Probabilidade de voltar (baseada em quanto já passou do intervalo)
      let probVoltar = 0
      let diasAteProxima = intervaloMedio
      let proximaData = new Date(ultima.getTime() + intervaloMedio * 86400000)
      let confianca: Prev['confianca'] = 'baixa'
      let urgencia: Prev['urgencia'] = 'novo'

      if (c.orders.length === 1) {
        // Cliente novo: baixa confiança, data prevista = hoje + 30d
        probVoltar = 50
        diasAteProxima = 30
        proximaData = new Date(hoje.getTime() + 30 * 86400000)
        confianca = 'baixa'
        urgencia = diasDesde < 30 ? 'novo' : diasDesde < 60 ? 'em_breve' : 'atrasado'
      } else if (intervaloMedio > 0) {
        diasAteProxima = Math.max(0, Math.round(intervaloMedio - diasDesde))
        proximaData = new Date(ultima.getTime() + intervaloMedio * 86400000)
        // Confiança: mais compras = mais dados
        if (c.orders.length >= 5) confianca = 'alta'
        else if (c.orders.length >= 3) confianca = 'media'
        else confianca = 'baixa'
        // Probabilidade: se já passou > 1.5x o intervalo, probabilidade cai
        if (diasDesde > intervaloMedio * 1.5) {
          probVoltar = Math.max(10, 50 - ((diasDesde - intervaloMedio * 1.5) / desvio) * 10)
          urgencia = 'atrasado'
        } else if (diasDesde > intervaloMedio) {
          probVoltar = 70
          urgencia = diasAteProxima < 7 ? 'em_breve' : 'normal'
        } else {
          probVoltar = 90
          urgencia = diasAteProxima < 7 ? 'em_breve' : 'normal'
        }
        if (diasAteProxima <= 0) urgencia = 'atrasado'
        else if (diasAteProxima <= 3) urgencia = 'em_breve'
        probVoltar = Math.max(5, Math.min(95, probVoltar))
      }

      // Melhor dia da semana e horário
      const diasSemana = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
      const contagemDias = new Array(7).fill(0)
      const contagemHoras = new Array(24).fill(0)
      for (const o of c.orders) {
        const d = new Date(o.created_at!)
        contagemDias[d.getDay()]++
        contagemHoras[d.getHours()]++
      }
      const melhorDiaIdx = contagemDias.indexOf(Math.max(...contagemDias))
      const melhorHoraIdx = contagemHoras.indexOf(Math.max(...contagemHoras))

      // Período
      let melhorPeriodo = 'Madrugada'
      if (melhorHoraIdx >= 6 && melhorHoraIdx < 12) melhorPeriodo = 'Manhã'
      else if (melhorHoraIdx >= 12 && melhorHoraIdx < 18) melhorPeriodo = 'Tarde'
      else if (melhorHoraIdx >= 18) melhorPeriodo = 'Noite'

      previsoes.push({
        id: c.id,
        nome: c.nome || 'Sem nome',
        email: c.email,
        telefone: c.telefone,
        total_pedidos: c.orders.length,
        receita_total: Number(receitaTotal.toFixed(2)),
        ultima_compra: ultima.toISOString(),
        dias_desde_ultima: diasDesde,
        intervalo_medio_dias: Number(intervaloMedio.toFixed(1)),
        desvio_padrao_dias: Number(desvio.toFixed(1)),
        proxima_compra_prevista: proximaData.toISOString(),
        dias_ate_proxima: diasAteProxima,
        probabilidade_voltar_pct: Number(probVoltar.toFixed(0)),
        confianca,
        melhor_dia_semana: diasSemana[melhorDiaIdx] || '—',
        melhor_periodo: `${melhorPeriodo} (${melhorHoraIdx}h)`,
        urgencia,
        status,
      })
    }

    // Ordena: atrasados primeiro, depois maior probabilidade
    const urgOrder: any = { atrasado: 0, em_breve: 1, hoje: 2, normal: 3, novo: 4 }
    previsoes.sort((a, b) => {
      const u = urgOrder[a.urgencia] - urgOrder[b.urgencia]
      if (u !== 0) return u
      return b.probabilidade_voltar_pct - a.probabilidade_voltar_pct
    })

    const top = previsoes.slice(0, limit)

    // Resumo
    const atrasados = previsoes.filter((p) => p.urgencia === 'atrasado').length
    const emBreve = previsoes.filter((p) => p.urgencia === 'em_breve' || p.urgencia === 'hoje').length
    const altaConf = previsoes.filter((p) => p.confianca === 'alta').length
    const valorRisco = previsoes.filter((p) => p.urgencia === 'atrasado').reduce((s, p) => s + p.receita_total, 0)

    const insights: any[] = []
    if (atrasados > 0) {
      insights.push({
        emoji: '⚠️',
        tipo: 'atencao',
        titulo: `${atrasados} clientes ATRASADOS (já deveriam ter voltado)`,
        detalhe: `Receita total em risco: R$ ${valorRisco.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}. Acione agora via WhatsApp!`,
      })
    }
    if (emBreve > 0) {
      insights.push({
        emoji: '⏰',
        tipo: 'info',
        titulo: `${emBreve} clientes com compra prevista nos próximos 7 dias`,
        detalhe: `Prepare estoque e marketing personalizado. Momento ideal de abordagem!`,
      })
    }
    if (altaConf > 0) {
      insights.push({
        emoji: '🎯',
        tipo: 'positivo',
        titulo: `${altaConf} clientes com previsão de ALTA confiança (5+ compras)`,
        detalhe: `Esses clientes têm padrão bem definido. Pode confiar na data prevista.`,
      })
    }
    // Próxima semana: previsão de demanda
    const proximaSemana = previsoes.filter((p) => p.dias_ate_proxima >= 0 && p.dias_ate_proxima <= 7).reduce((s, p) => s + (p.receita_total / Math.max(p.total_pedidos, 1)), 0)
    if (proximaSemana > 0) {
      insights.push({
        emoji: '📅',
        tipo: 'info',
        titulo: `Receita prevista próxima semana: ~R$ ${proximaSemana.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`,
        detalhe: `Baseado em recompra prevista dos clientes ativos. Útil pra planejar estoque.`,
      })
    }

    return NextResponse.json({
      ok: true,
      total: previsoes.length,
      atrasados,
      em_breve: emBreve,
      alta_confianca: altaConf,
      valor_risco: Number(valorRisco.toFixed(2)),
      clientes: top,
      insights,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message, stack: err.stack }, { status: 500 })
  }
}
