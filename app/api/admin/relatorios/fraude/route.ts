// GET /api/admin/relatorios/fraude
// Detecção de fraude baseada em heurísticas:
// - Valor muito acima da média do cliente
// - Cliente novo com pedido grande
// - Múltiplas orders em curto período
// - Endereço de entrega suspeito (estado diferente do normal)
// - Cancelamento recorrente (chargeback)

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const days = Math.min(Number(searchParams.get('days') || 90), 365)
    const limit = Math.min(Number(searchParams.get('limit') || 100), 500)
    const minScore = Math.min(Number(searchParams.get('min_score') || 30), 100)

    const dataInicio = new Date()
    dataInicio.setDate(dataInicio.getDate() - days)

    const orders = await prisma.orders.findMany({
      where: {
        created_at: { gte: dataInicio },
        status: { not: 'cancelado' },
      },
      select: {
        id: true,
        order_number: true,
        total: true,
        created_at: true,
        status: true,
        customer_id: true,
        customers: { select: { id: true, nome: true, email: true, telefone: true, orders: { select: { id: true, total: true, created_at: true, status: true, endereco_entrega: true } } } },
        endereco_entrega: true,
      },
    })

    type Alerta = {
      score: number
      nivel: 'baixo' | 'medio' | 'alto' | 'critico'
      order_id: string
      order_number: string
      total: number
      cliente_id: string
      cliente_nome: string
      cliente_email: string | null
      cliente_telefone: string | null
      data: string
      sinais: { tipo: string; peso: number; descricao: string }[]
      sugestao: string
    }

    const alertas: Alerta[] = []

    for (const o of orders) {
      if (!o.customers) continue
      const sinais: Alerta['sinais'] = []
      let score = 0

      const ticket = Number(o.total || 0)
      const outrasOrders = o.customers.orders.filter((oo) => oo.id !== o.id)
      const ticketMedio = outrasOrders.length > 0 ? outrasOrders.reduce((s, oo) => s + Number(oo.total || 0), 0) / outrasOrders.length : 0
      const cancelamentos = outrasOrders.filter((oo) => oo.status === 'cancelado').length
      const totalOrders = outrasOrders.length

      // 1) Valor muito acima da média (peso até 30)
      if (ticketMedio > 0) {
        const ratio = ticket / ticketMedio
        if (ratio > 10 && ticket > 500) { score += 30; sinais.push({ tipo: 'valor_alto', peso: 30, descricao: `Valor ${ratio.toFixed(1)}x maior que média (R$ ${ticketMedio.toFixed(2)} → R$ ${ticket.toFixed(2)})` }) }
        else if (ratio > 5) { score += 15; sinais.push({ tipo: 'valor_alto', peso: 15, descricao: `Valor ${ratio.toFixed(1)}x acima da média` }) }
        else if (ratio > 3) { score += 5; sinais.push({ tipo: 'valor_alto', peso: 5, descricao: `Valor acima da média` }) }
      }

      // 2) Cliente novo com pedido grande (peso 20)
      if (totalOrders === 0 && ticket > 300) { score += 20; sinais.push({ tipo: 'cliente_novo', peso: 20, descricao: 'Cliente NOVO com pedido de alto valor' }) }
      else if (totalOrders === 0 && ticket > 100) { score += 10; sinais.push({ tipo: 'cliente_novo', peso: 10, descricao: 'Cliente novo' }) }

      // 3) Múltiplas orders em curto período (peso até 20)
      const ultimas7d = outrasOrders.filter((oo) => {
        const d = new Date(oo.created_at!)
        return (Date.now() - d.getTime()) < 7 * 86400000
      })
      if (ultimas7d.length >= 5) { score += 20; sinais.push({ tipo: 'multiplas_orders', peso: 20, descricao: `${ultimas7d.length} orders em 7 dias` }) }
      else if (ultimas7d.length >= 3) { score += 10; sinais.push({ tipo: 'multiplas_orders', peso: 10, descricao: `${ultimas7d.length} orders em 7 dias` }) }

      // 4) Taxa de cancelamento alta (peso até 25)
      if (totalOrders > 0) {
        const taxaCanc = cancelamentos / totalOrders
        if (taxaCanc >= 0.5) { score += 25; sinais.push({ tipo: 'cancelamento_alto', peso: 25, descricao: `${(taxaCanc * 100).toFixed(0)}% de cancelamento histórico` }) }
        else if (taxaCanc >= 0.3) { score += 10; sinais.push({ tipo: 'cancelamento_alto', peso: 10, descricao: `${(taxaCanc * 100).toFixed(0)}% de cancelamento` }) }
      }

      // 5) Endereço de entrega muito diferente (peso 10)
      if (outrasOrders.length > 0 && o.endereco_entrega) {
        const ufsAntigas = new Set<string>()
        for (const oo of outrasOrders) {
          const uf = (oo.endereco_entrega as any)?.uf
          if (uf) ufsAntigas.add(String(uf).toUpperCase())
        }
        const ufNova = ((o.endereco_entrega as any)?.uf || '').toString().toUpperCase()
        if (ufNova && ufsAntigas.size > 0 && !ufsAntigas.has(ufNova)) {
          score += 10
          sinais.push({ tipo: 'endereco_diferente', peso: 10, descricao: `Entrega em ${ufNova}, cliente sempre pede em ${Array.from(ufsAntigas).join('/')}` })
        }
      }

      if (score < minScore) continue

      let nivel: Alerta['nivel']
      if (score >= 80) nivel = 'critico'
      else if (score >= 60) nivel = 'alto'
      else if (score >= 40) nivel = 'medio'
      else nivel = 'baixo'

      // Sugestão
      let sugestao = ''
      if (nivel === 'critico') sugestao = '🚨 Bloquear pagamento até verificar identidade do cliente'
      else if (nivel === 'alto') sugestao = '⚠️ Verificar manualmente antes de enviar'
      else if (nivel === 'medio') sugestao = '👀 Monitorar próximos pedidos do cliente'
      else sugestao = '✓ Provavelmente OK, mas vale conferir'

      alertas.push({
        score,
        nivel,
        order_id: o.id,
        order_number: o.order_number || '',
        total: ticket,
        cliente_id: o.customers.id,
        cliente_nome: o.customers.nome || 'Sem nome',
        cliente_email: o.customers.email,
        cliente_telefone: o.customers.telefone,
        data: o.created_at?.toISOString() || '',
        sinais,
        sugestao,
      })
    }

    alertas.sort((a, b) => b.score - a.score)
    const top = alertas.slice(0, limit)

    const porNivel = {
      critico: alertas.filter((a) => a.nivel === 'critico').length,
      alto: alertas.filter((a) => a.nivel === 'alto').length,
      medio: alertas.filter((a) => a.nivel === 'medio').length,
      baixo: alertas.filter((a) => a.nivel === 'baixo').length,
    }

    const insights: any[] = []
    if (porNivel.critico > 0) {
      insights.push({ emoji: '🚨', tipo: 'atencao', titulo: `${porNivel.critico} orders CRÍTICAS`, detalhe: 'Risco alto de fraude. Bloquear pagamento até verificação.' })
    }
    if (porNivel.alto > 0) {
      insights.push({ emoji: '⚠️', tipo: 'atencao', titulo: `${porNivel.alto} orders de ALTO risco`, detalhe: 'Verificar manualmente antes de enviar.' })
    }
    if (porNivel.critico === 0 && porNivel.alto === 0 && alertas.length > 0) {
      insights.push({ emoji: '✅', tipo: 'positivo', titulo: 'Sem fraude crítica detectada', detalhe: `${alertas.length} alertas leves/médios. Pode prosseguir com confiança.` })
    }
    if (alertas.length === 0) {
      insights.push({ emoji: '✅', tipo: 'positivo', titulo: 'Nenhum alerta de fraude no período', detalhe: 'Todos os pedidos dentro do padrão normal.' })
    }

    return NextResponse.json({
      ok: true,
      total_alertas: alertas.length,
      por_nivel: porNivel,
      valor_em_risco: Number(alertas.filter((a) => a.nivel === 'critico' || a.nivel === 'alto').reduce((s, a) => s + a.total, 0).toFixed(2)),
      alertas: top,
      insights,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message, stack: err.stack }, { status: 500 })
  }
}
