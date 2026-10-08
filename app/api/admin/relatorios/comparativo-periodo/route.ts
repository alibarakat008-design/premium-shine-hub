// GET /api/admin/relatorios/comparativo-periodo?inicio_a=2025-01-01&fim_a=2025-01-31&inicio_b=2026-01-01&fim_b=2026-01-31
// Compara 2 janelas temporais:
// - KPIs: receita, pedidos, ticket médio, unidades, % cancelamento
// - Top UFs / Cidades / Marcas / Produtos
// - Variação % entre A e B
// - Evolução mês-a-mês dos 2 períodos (sobrepostos)
// - Insights: o que subiu, o que caiu, novos top

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const inicioA = searchParams.get('inicio_a')
    const fimA = searchParams.get('fim_a')
    const inicioB = searchParams.get('inicio_b')
    const fimB = searchParams.get('fim_b')

    if (!inicioA || !fimA || !inicioB || !fimB) {
      return NextResponse.json({ ok: false, error: 'Informe inicio_a, fim_a, inicio_b, fim_b (YYYY-MM-DD)' }, { status: 400 })
    }

    const startA = new Date(inicioA)
    const endA = new Date(fimA + 'T23:59:59')
    const startB = new Date(inicioB)
    const endB = new Date(fimB + 'T23:59:59')

    // Buscar orders dos 2 períodos
    const ordersAll = await prisma.orders.findMany({
      where: {
        OR: [
          { created_at: { gte: startA, lte: endA } },
          { created_at: { gte: startB, lte: endB } },
        ],
      },
      select: {
        id: true,
        total: true,
        status: true,
        created_at: true,
        endereco_entrega: true,
        order_items: {
          select: {
            quantidade: true,
            preco_total: true,
            products: { select: { genero: true, sku: true, nome: true, brands: { select: { id: true, nome: true } } } },
          },
        },
      },
    })

    // Separar por período
    const ordersA = ordersAll.filter((o) => o.created_at && o.created_at >= startA && o.created_at <= endA)
    const ordersB = ordersAll.filter((o) => o.created_at && o.created_at >= startB && o.created_at <= endB)

    const buildResumo = (orders: any[]) => {
      const cancelados = orders.filter((o) => o.status === 'cancelado').length
      const receita = orders.reduce((s, o) => s + Number(o.total || 0), 0)
      const unidades = orders.reduce((s, o) => s + o.order_items.reduce((acc: number, i: any) => acc + i.quantidade, 0), 0)
      const ticket = orders.length > 0 ? receita / orders.length : 0

      const ufs = new Map<string, { pedidos: number; receita: number }>()
      const cidades = new Map<string, { uf: string; cidade: string; pedidos: number; receita: number }>()
      const marcas = new Map<string, { pedidos: number; receita: number; unidades: number }>()
      const produtos = new Map<string, { sku: string; nome: string; pedidos: number; receita: number; unidades: number; genero: string | null }>()
      const genero = { feminino: 0, masculino: 0, unissex: 0, indefinido: 0 }
      const evolucaoDiaria = new Map<string, { data: string; pedidos: number; receita: number; unidades: number }>()

      for (const o of orders) {
        const uf = (o.endereco_entrega?.uf || '').toString().toUpperCase() || '—'
        const cidade = (o.endereco_entrega?.cidade || '').toString().trim() || '—'
        const dataKey = o.created_at ? o.created_at.toISOString().slice(0, 10) : 'sem-data'

        if (!ufs.has(uf)) ufs.set(uf, { pedidos: 0, receita: 0 })
        const u = ufs.get(uf)!
        u.pedidos++
        u.receita += Number(o.total || 0)

        const cidKey = `${uf}-${cidade}`
        if (!cidades.has(cidKey)) cidades.set(cidKey, { uf, cidade, pedidos: 0, receita: 0 })
        const c = cidades.get(cidKey)!
        c.pedidos++
        c.receita += Number(o.total || 0)

        for (const it of o.order_items) {
          const qty = it.quantidade || 0
          const rec = Number(it.preco_total || 0)
          const g = (it.products?.genero || '').toLowerCase()
          if (g === 'feminino') genero.feminino += qty
          else if (g === 'masculino') genero.masculino += qty
          else if (g === 'unissex') genero.unissex += qty
          else genero.indefinido += qty

          if (it.products?.brands) {
            const m = it.products.brands
            if (!marcas.has(m.id)) marcas.set(m.id, { pedidos: 0, receita: 0, unidades: 0 })
            const ma = marcas.get(m.id)!
            ma.pedidos += qty
            ma.receita += rec
            ma.unidades += qty
          }
          if (it.products?.sku) {
            if (!produtos.has(it.products.sku)) produtos.set(it.products.sku, { sku: it.products.sku, nome: it.products.nome || it.nome_produto, pedidos: 0, receita: 0, unidades: 0, genero: it.products.genero })
            const p = produtos.get(it.products.sku)!
            p.pedidos += qty
            p.receita += rec
            p.unidades += qty
          }
        }

        if (!evolucaoDiaria.has(dataKey)) evolucaoDiaria.set(dataKey, { data: dataKey, pedidos: 0, receita: 0, unidades: 0 })
        const d = evolucaoDiaria.get(dataKey)!
        d.pedidos++
        d.receita += Number(o.total || 0)
        d.unidades += o.order_items.reduce((s: number, i: any) => s + i.quantidade, 0)
      }

      return {
        pedidos: orders.length,
        pedidos_cancelados: cancelados,
        pedidos_validos: orders.length - cancelados,
        receita: Number(receita.toFixed(2)),
        unidades,
        ticket_medio: Number(ticket.toFixed(2)),
        pct_cancelamento: orders.length > 0 ? Number(((cancelados / orders.length) * 100).toFixed(1)) : 0,
        top_ufs: Array.from(ufs.values()).sort((a, b) => b.receita - a.receita).slice(0, 10),
        top_cidades: Array.from(cidades.values()).sort((a, b) => b.receita - a.receita).slice(0, 10),
        top_marcas: Array.from(marcas.values()).sort((a, b) => b.receita - a.receita).slice(0, 10).map((m) => ({ ...m })),
        top_produtos: Array.from(produtos.values()).sort((a, b) => b.receita - a.receita).slice(0, 15),
        genero,
        evolucao: Array.from(evolucaoDiaria.values()).sort((a, b) => a.data.localeCompare(b.data)),
      }
    }

    const resumoA = buildResumo(ordersA)
    const resumoB = buildResumo(ordersB)

    // Variações
    const variacao = (a: number, b: number) => {
      if (b === 0) return a > 0 ? 100 : 0
      return Number((((a - b) / b) * 100).toFixed(1))
    }

    // Insights
    const insights: any[] = []
    if (resumoA.receita > 0 && resumoB.receita > 0) {
      const v = variacao(resumoB.receita, resumoA.receita)
      if (v > 10) insights.push({ emoji: '📈', tipo: 'positivo', titulo: `Receita subiu ${v.toFixed(1)}%`, detalhe: `${formatBRL(resumoA.receita)} → ${formatBRL(resumoB.receita)}` })
      else if (v < -10) insights.push({ emoji: '📉', tipo: 'atencao', titulo: `Receita caiu ${Math.abs(v).toFixed(1)}%`, detalhe: `${formatBRL(resumoA.receita)} → ${formatBRL(resumoB.receita)}` })
    }
    if (resumoA.pedidos > 0 && resumoB.pedidos > 0) {
      const v = variacao(resumoB.pedidos, resumoA.pedidos)
      if (v > 10) insights.push({ emoji: '🚀', tipo: 'positivo', titulo: `Pedidos subiram ${v.toFixed(1)}%`, detalhe: `${resumoA.pedidos} → ${resumoB.pedidos}` })
      else if (v < -10) insights.push({ emoji: '⚠️', tipo: 'atencao', titulo: `Pedidos caíram ${Math.abs(v).toFixed(1)}%`, detalhe: `${resumoA.pedidos} → ${resumoB.pedidos}` })
    }
    if (resumoA.ticket_medio > 0 && resumoB.ticket_medio > 0) {
      const v = variacao(resumoB.ticket_medio, resumoA.ticket_medio)
      if (Math.abs(v) > 5) {
        insights.push({ emoji: v > 0 ? '💎' : '📉', tipo: v > 0 ? 'positivo' : 'atencao', titulo: `Ticket médio ${v > 0 ? 'subiu' : 'caiu'} ${Math.abs(v).toFixed(1)}%`, detalhe: `${formatBRL(resumoA.ticket_medio)} → ${formatBRL(resumoB.ticket_medio)}` })
      }
    }
    if (resumoA.pct_cancelamento > 0 || resumoB.pct_cancelamento > 0) {
      const v = variacao(resumoB.pct_cancelamento, resumoA.pct_cancelamento)
      if (Math.abs(v) > 1) {
        insights.push({ emoji: v > 0 ? '❌' : '✅', tipo: v > 0 ? 'atencao' : 'positivo', titulo: `Cancelamento ${v > 0 ? 'subiu' : 'caiu'} ${Math.abs(v).toFixed(1)}pp`, detalhe: `${resumoA.pct_cancelamento.toFixed(1)}% → ${resumoB.pct_cancelamento.toFixed(1)}%` })
      }
    }

    // Top mudanças: produtos que subiram/caíram
    const prodsA = new Map(resumoA.top_produtos.map((p: any) => [p.sku, p.receita]))
    const prodsB = new Map(resumoB.top_produtos.map((p: any) => [p.sku, p.receita]))
    const allProds = new Set([...prodsA.keys(), ...prodsB.keys()])
    const variacoesProd: { sku: string; nome: string; receita_a: number; receita_b: number; variacao_pct: number }[] = []
    for (const sku of allProds) {
      const recA = prodsA.get(sku) || 0
      const recB = prodsB.get(sku) || 0
      if (recA > 100 || recB > 100) { // ignora produtos com receita insignificante
        const v = variacao(recB, recA)
        const nome = resumoA.top_produtos.find((p: any) => p.sku === sku)?.nome || resumoB.top_produtos.find((p: any) => p.sku === sku)?.nome || sku
        variacoesProd.push({ sku, nome, receita_a: recA, receita_b: recB, variacao_pct: v })
      }
    }
    variacoesProd.sort((a, b) => b.variacao_pct - a.variacao_pct)
    const topSubindo = variacoesProd.filter((p) => p.variacao_pct > 0).slice(0, 5)
    const topCaindo = variacoesProd.filter((p) => p.variacao_pct < 0).sort((a, b) => a.variacao_pct - b.variacao_pct).slice(0, 5)

    return NextResponse.json({
      ok: true,
      filtros: { inicio_a: inicioA, fim_a: fimA, inicio_b: inicioB, fim_b: fimB },
      dias_periodo_a: Math.ceil((endA.getTime() - startA.getTime()) / 86400000),
      dias_periodo_b: Math.ceil((endB.getTime() - startB.getTime()) / 86400000),
      periodo_a: resumoA,
      periodo_b: resumoB,
      variacoes: {
        receita: variacao(resumoB.receita, resumoA.receita),
        pedidos: variacao(resumoB.pedidos, resumoA.pedidos),
        unidades: variacao(resumoB.unidades, resumoA.unidades),
        ticket: variacao(resumoB.ticket_medio, resumoA.ticket_medio),
        cancelamento_pp: Number((resumoB.pct_cancelamento - resumoA.pct_cancelamento).toFixed(2)),
      },
      top_subindo: topSubindo,
      top_caindo: topCaindo,
      insights,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message, stack: err.stack }, { status: 500 })
  }
}

function formatBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}
