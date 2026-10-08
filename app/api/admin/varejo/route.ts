// GET /api/admin/varejo
// Vendas varejo LIURAESSENCE (separadas dos marketplaces dos B2Bs)
// - site_b2c, whatsapp, vendedora, b2b
// NÃO inclui vendas de B2Bs (mercado_livre, shopee, amazon)

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import type { order_origem } from '@prisma/client'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const CANAIS_VAREJO: order_origem[] = ['site_b2c', 'whatsapp', 'vendedora', 'b2b'] 

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const meses = Math.min(Number(searchParams.get('meses') || 6), 12)
    const dataInicio = new Date()
    dataInicio.setMonth(dataInicio.getMonth() - meses)

    const orders = await prisma.orders.findMany({
      where: {
        created_at: { gte: dataInicio },
        status: { not: 'cancelado' },
        origem: { in: CANAIS_VAREJO },
      },
      select: {
        id: true,
        total: true,
        origem: true,
        status: true,
        created_at: true,
        customer_id: true,
        customers: { select: { nome: true, email: true, telefone: true } },
        order_items: { select: { quantidade: true, products: { select: { sku: true, nome: true } } } },
        users_orders_vendedor_idTousers: { select: { nome: true } },
      },
    })

    // KPIs
    const totalReceita = orders.reduce((s, o) => s + Number(o.total || 0), 0)
    const totalPedidos = orders.length
    const totalUnidades = orders.reduce((s, o) => s + o.order_items.reduce((acc, i) => acc + i.quantidade, 0), 0)
    const totalClientesUnicos = new Set(orders.map((o) => o.customer_id).filter(Boolean)).size

    // Por origem
    const porOrigem: Record<string, { pedidos: number; receita: number; unidades: number; clientes: Set<string> }> = {}
    for (const o of orders) {
      const orig = o.origem || 'outros'
      if (!porOrigem[orig]) porOrigem[orig] = { pedidos: 0, receita: 0, unidades: 0, clientes: new Set() }
      const p = porOrigem[orig]
      p.pedidos++
      p.receita += Number(o.total || 0)
      p.unidades += o.order_items.reduce((s, i) => s + i.quantidade, 0)
      if (o.customer_id) p.clientes.add(o.customer_id)
    }

    // Top vendedoras
    const vendedorasMap = new Map<string, { nome: string; pedidos: number; receita: number }>()
    for (const o of orders) {
      const vid = (o as any).vendedor_id || 'loja'
      const nome = o.users_orders_vendedor_idTousers?.nome || 'Loja (sem vendedora)'
      if (!vendedorasMap.has(vid)) vendedorasMap.set(vid, { nome, pedidos: 0, receita: 0 })
      const v = vendedorasMap.get(vid)!
      v.pedidos++
      v.receita += Number(o.total || 0)
    }
    const topVendedoras = Array.from(vendedorasMap.values()).sort((a, b) => b.receita - a.receita).slice(0, 10)

    // Top clientes
    const clientesMap = new Map<string, { nome: string; email: string; telefone: string; pedidos: number; receita: number }>()
    for (const o of orders) {
      const cid = o.customer_id || 'desconhecido'
      if (!clientesMap.has(cid)) {
        clientesMap.set(cid, {
          nome: o.customers?.nome || '—',
          email: o.customers?.email || '',
          telefone: o.customers?.telefone || '',
          pedidos: 0, receita: 0,
        })
      }
      const c = clientesMap.get(cid)!
      c.pedidos++
      c.receita += Number(o.total || 0)
    }
    const topClientes = Array.from(clientesMap.values()).sort((a, b) => b.receita - a.receita).slice(0, 20)

    // Evolução mensal
    const evolucaoMap = new Map<string, { mes: string; pedidos: number; receita: number }>()
    for (const o of orders) {
      if (!o.created_at) continue
      const mes = `${o.created_at.getFullYear()}-${String(o.created_at.getMonth() + 1).padStart(2, '0')}`
      if (!evolucaoMap.has(mes)) evolucaoMap.set(mes, { mes, pedidos: 0, receita: 0 })
      const m = evolucaoMap.get(mes)!
      m.pedidos++
      m.receita += Number(o.total || 0)
    }
    const evolucao = Array.from(evolucaoMap.values()).sort((a, b) => a.mes.localeCompare(b.mes))

    return NextResponse.json({
      ok: true,
      meses,
      total_pedidos: totalPedidos,
      total_receita: Number(totalReceita.toFixed(2)),
      total_unidades: totalUnidades,
      total_clientes_unicos: totalClientesUnicos,
      ticket_medio: totalPedidos > 0 ? Number((totalReceita / totalPedidos).toFixed(2)) : 0,
      por_origem: Object.entries(porOrigem).map(([k, v]) => ({ origem: k, pedidos: v.pedidos, receita: Number(v.receita.toFixed(2)), unidades: v.unidades, clientes_unicos: v.clientes.size })),
      top_vendedoras: topVendedoras.map((v) => ({ ...v, receita: Number(v.receita.toFixed(2)) })),
      top_clientes: topClientes.map((c) => ({ ...c, receita: Number(c.receita.toFixed(2)) })),
      evolucao: evolucao.map((e) => ({ ...e, receita: Number(e.receita.toFixed(2)) })),
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message, stack: err.stack }, { status: 500 })
  }
}
