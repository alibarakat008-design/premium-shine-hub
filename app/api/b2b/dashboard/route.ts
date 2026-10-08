// GET /api/b2b/dashboard?meses=6
// Dashboard B2B: KPIs + evolução + top produtos + por marketplace
// Mostra APENAS os dados das contas vinculadas ao B2B
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/b2b-auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    const session = getSession()
    if (!session) return NextResponse.json({ ok: false, error: 'Não autenticado' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const meses = Math.min(Number(searchParams.get('meses') || 6), 12)

    // Busca contas vinculadas do B2B (apenas tipo marketplace)
    const contas = await prisma.b2b_marketplace_accounts.findMany({
      where: {
        b2b_client_id: session.b2b_client_id,
        // Apenas contas de marketplace (não varejo)
        OR: [
          { channel_type: 'marketplace' },
          { channel_type: null as any }, // backward compat
        ],
      },
      select: { id: true, plataforma: true, nickname: true, account_id: true, channel_type: true },
    })

    if (contas.length === 0) {
      return NextResponse.json({
        ok: true,
        empty: true,
        message: 'Você ainda não vinculou nenhuma conta de marketplace. Vá em Marketplace pra começar.',
        contas: [],
        resumo: { pedidos: 0, receita: 0, ticket: 0, unidades: 0 },
        evolucao: [],
        top_produtos: [],
        por_marketplace: [],
      })
    }

    const contaIds = contas.map((c) => c.id)

    const dataInicio = new Date()
    dataInicio.setMonth(dataInicio.getMonth() - meses)

    // Pega orders dessas contas (apenas origem marketplace pra não misturar com varejo)
    const orders = await prisma.orders.findMany({
      where: {
        created_at: { gte: dataInicio },
        status: { not: 'cancelado' },
        marketplace_account_id: { in: contaIds },
        // Apenas origens de marketplace (B2B não vê vendas do site/WhatsApp da LIURAESSENCE)
        origem: { in: ['mercado_livre', 'shopee'] },
      },
      select: {
        id: true,
        order_number: true,
        total: true,
        status: true,
        created_at: true,
        order_items: {
          select: {
            quantidade: true,
            preco_total: true,
            products: { select: { sku: true, nome: true, brands: { select: { nome: true } } } },
          },
        },
        marketplace_accounts: { select: { id: true, nickname: true, plataforma: true } },
      },
    })

    // Resumo
    const totalReceita = orders.reduce((s, o) => s + Number(o.total || 0), 0)
    const totalPedidos = orders.length
    const totalUnidades = orders.reduce((s, o) => s + o.order_items.reduce((acc, i) => acc + i.quantidade, 0), 0)
    const ticket = totalPedidos > 0 ? totalReceita / totalPedidos : 0

    // Hoje
    const hoje = new Date()
    const inicioHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())
    const ordersHoje = orders.filter((o) => o.created_at && new Date(o.created_at) >= inicioHoje)
    const receitaHoje = ordersHoje.reduce((s, o) => s + Number(o.total || 0), 0)

    // Evolução diária
    const evolucaoMap = new Map<string, { data: string; pedidos: number; receita: number; unidades: number }>()
    for (const o of orders) {
      if (!o.created_at) continue
      const key = new Date(o.created_at).toISOString().slice(0, 10)
      if (!evolucaoMap.has(key)) evolucaoMap.set(key, { data: key, pedidos: 0, receita: 0, unidades: 0 })
      const e = evolucaoMap.get(key)!
      e.pedidos++
      e.receita += Number(o.total || 0)
      e.unidades += o.order_items.reduce((s, i) => s + i.quantidade, 0)
    }
    const evolucao = Array.from(evolucaoMap.values()).sort((a, b) => a.data.localeCompare(b.data))

    // Top produtos
    const prodsMap = new Map<string, { sku: string; nome: string; marca: string; unidades: number; receita: number; pedidos: number }>()
    for (const o of orders) {
      for (const it of o.order_items) {
        if (!it.products?.sku) continue
        if (!prodsMap.has(it.products.sku)) {
          prodsMap.set(it.products.sku, { sku: it.products.sku, nome: it.products.nome, marca: it.products.brands?.nome || '—', unidades: 0, receita: 0, pedidos: 0 })
        }
        const p = prodsMap.get(it.products.sku)!
        p.unidades += it.quantidade
        p.receita += Number(it.preco_total || 0)
        p.pedidos += 1
      }
    }
    const topProdutos = Array.from(prodsMap.values()).sort((a, b) => b.receita - a.receita).slice(0, 10).map((p) => ({ ...p, receita: Number(p.receita.toFixed(2)) }))

    // Por marketplace
    const mktMap = new Map<string, { plataforma: string; nickname: string; pedidos: number; receita: number; unidades: number }>()
    for (const o of orders) {
      const key = `${o.marketplace_accounts?.plataforma || 'outros'}|${o.marketplace_accounts?.nickname || '—'}`
      if (!mktMap.has(key)) {
        mktMap.set(key, {
          plataforma: o.marketplace_accounts?.plataforma || 'outros',
          nickname: o.marketplace_accounts?.nickname || '—',
          pedidos: 0, receita: 0, unidades: 0,
        })
      }
      const m = mktMap.get(key)!
      m.pedidos++
      m.receita += Number(o.total || 0)
      m.unidades += o.order_items.reduce((s, i) => s + i.quantidade, 0)
    }
    const porMarketplace = Array.from(mktMap.values()).map((m) => ({ ...m, receita: Number(m.receita.toFixed(2)) })).sort((a, b) => b.receita - a.receita)

    return NextResponse.json({
      ok: true,
      contas: contas.length,
      resumo: {
        pedidos: totalPedidos,
        receita: Number(totalReceita.toFixed(2)),
        unidades: totalUnidades,
        ticket_medio: Number(ticket.toFixed(2)),
        pedidos_hoje: ordersHoje.length,
        receita_hoje: Number(receitaHoje.toFixed(2)),
      },
      evolucao: evolucao.map((e) => ({ ...e, receita: Number(e.receita.toFixed(2)) })),
      top_produtos: topProdutos,
      por_marketplace: porMarketplace,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message, stack: err.stack }, { status: 500 })
  }
}
