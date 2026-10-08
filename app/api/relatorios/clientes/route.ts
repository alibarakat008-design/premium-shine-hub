/**
 * API: Top Clientes
 * GET /api/relatorios/clientes
 *
 * Retorna top clientes por:
 * - LTV (Lifetime Value)
 * - Recompra
 * - Ticket médio
 * - Última compra
 */

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    // Agrupar orders por customer_id
    const orders = await prisma.orders.findMany({
      where: { customer_id: { not: null } },
      select: {
        id: true,
        customer_id: true,
        total: true,
        created_at: true,
        marketplace_account_id: true,
        marketplace_accounts: { select: { plataforma: true } },
      },
      orderBy: { created_at: 'desc' },
    })

    interface Cliente {
      customer_id: string
      total_pedidos: number
      total_gasto: number
      primeira_compra: Date
      ultima_compra: Date
      canais: Set<string>
      ticket_medio: number
    }

    const clientesMap = new Map<string, Cliente>()

    for (const o of orders) {
      const key = o.customer_id!
      if (!clientesMap.has(key)) {
        clientesMap.set(key, {
          customer_id: key,
          total_pedidos: 0,
          total_gasto: 0,
          primeira_compra: o.created_at || new Date(),
          ultima_compra: o.created_at || new Date(),
          canais: new Set(),
          ticket_medio: 0,
        })
      }
      const c = clientesMap.get(key)!
      c.total_pedidos++
      c.total_gasto += Number(o.total)
      if (o.created_at && new Date(o.created_at) < new Date(c.primeira_compra)) c.primeira_compra = o.created_at
      if (o.created_at && new Date(o.created_at) > new Date(c.ultima_compra)) c.ultima_compra = o.created_at
      if (o.marketplace_accounts?.plataforma) c.canais.add(o.marketplace_accounts.plataforma)
    }

    const clientes = Array.from(clientesMap.values()).map((c) => ({
      customer_id: c.customer_id,
      total_pedidos: c.total_pedidos,
      total_gasto: c.total_gasto,
      primeira_compra: c.primeira_compra,
      ultima_compra: c.ultima_compra,
      canais: Array.from(c.canais),
      ticket_medio: c.total_pedidos > 0 ? c.total_gasto / c.total_pedidos : 0,
      recompra: c.total_pedidos > 1,
    }))

    // Ordenar por LTV
    const topLTV = clientes.sort((a, b) => b.total_gasto - a.total_gasto).slice(0, 50)
    const topRecompra = [...clientes].filter(c => c.recompra).sort((a, b) => b.total_pedidos - a.total_pedidos).slice(0, 50)
    const topTicket = [...clientes].sort((a, b) => b.ticket_medio - a.ticket_medio).slice(0, 50)

    // Resumo
    const resumo = {
      total_clientes_unicos: clientes.length,
      clientes_recompraram: clientes.filter(c => c.recompra).length,
      taxa_recompra: clientes.length > 0 ? (clientes.filter(c => c.recompra).length / clientes.length) * 100 : 0,
      ltv_medio: clientes.length > 0 ? clientes.reduce((acc, c) => acc + c.total_gasto, 0) / clientes.length : 0,
      top_10_pct_faturamento: clientes.length > 0 ? (topLTV.slice(0, 10).reduce((acc, c) => acc + c.total_gasto, 0) / clientes.reduce((acc, c) => acc + c.total_gasto, 0)) * 100 : 0,
    }

    return NextResponse.json({
      success: true,
      data: { topLTV, topRecompra, topTicket, resumo },
    })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
