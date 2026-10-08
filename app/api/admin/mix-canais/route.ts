/**
 * API: Mix por Canal
 * GET /api/admin/mix-canais?dias=30
 *
 * Retorna dados por canal:
 * - Receita
 * - Pedidos
 * - CMV
 * - Lucro
 * - Margem %
 * - Unidades
 * - Ticket médio
 * - % do total
 */

import { NextRequest, NextResponse } from 'next/server'
import { pickCusto } from '@/lib/custos'
import { prisma } from '@/lib/prisma'
import { calcularComissao } from '@/lib/comissoes'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const COMISSOES: Record<string, number> = {
  mercado_livre: 13,
  shopee: 14,
  site_b2c: 4,
  whatsapp: 0,
  b2b: 5,
  vendedora: 10,
  outros: 5,
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const dias = parseInt(searchParams.get('dias') || '30')

    const inicio = new Date(Date.now() - dias * 24 * 3600 * 1000)

    // Orders (excluindo cancelados, igual insights)
    const orders = await prisma.orders.findMany({
      where: {
        created_at: { gte: inicio },
        status: { not: 'cancelado' },
      },
      select: {
        id: true,
        total: true,
        status: true,
        marketplace_accounts: { select: { plataforma: true } },
        order_items: {
          select: {
            quantidade: true,
            preco_unitario: true,
            products: {
              select: {
                product_prices: { select: { custo: true, canal: true } },
                marketplace_listings: { select: { envio_full: true, listing_type: true } },
              },
            },
          },
        },
      },
    })

    // Vendas globais (pra ver canais sem orders)
    const salesChannels = new Set<string>(orders.map((o) => o.marketplace_accounts?.plataforma || 'outros'))

    interface Canal {
      canal: string
      pedidos: number
      receita: number
      unidades: number
      cmv: number
      comissao: number
      lucro: number
      margem_pct: number
      ticket_medio: number
      share_pct: number
    }

    const canaisMap = new Map<string, Canal>()
    canaisMap.set('mercado_livre', { canal: 'mercado_livre', pedidos: 0, receita: 0, unidades: 0, cmv: 0, comissao: 0, lucro: 0, margem_pct: 0, ticket_medio: 0, share_pct: 0 })
    canaisMap.set('shopee', { canal: 'shopee', pedidos: 0, receita: 0, unidades: 0, cmv: 0, comissao: 0, lucro: 0, margem_pct: 0, ticket_medio: 0, share_pct: 0 })
    canaisMap.set('site_b2c', { canal: 'site_b2c', pedidos: 0, receita: 0, unidades: 0, cmv: 0, comissao: 0, lucro: 0, margem_pct: 0, ticket_medio: 0, share_pct: 0 })
    canaisMap.set('whatsapp', { canal: 'whatsapp', pedidos: 0, receita: 0, unidades: 0, cmv: 0, comissao: 0, lucro: 0, margem_pct: 0, ticket_medio: 0, share_pct: 0 })
    canaisMap.set('b2b', { canal: 'b2b', pedidos: 0, receita: 0, unidades: 0, cmv: 0, comissao: 0, lucro: 0, margem_pct: 0, ticket_medio: 0, share_pct: 0 })
    canaisMap.set('vendedora', { canal: 'vendedora', pedidos: 0, receita: 0, unidades: 0, cmv: 0, comissao: 0, lucro: 0, margem_pct: 0, ticket_medio: 0, share_pct: 0 })
    canaisMap.set('outros', { canal: 'outros', pedidos: 0, receita: 0, unidades: 0, cmv: 0, comissao: 0, lucro: 0, margem_pct: 0, ticket_medio: 0, share_pct: 0 })

    let totalReceita = 0
    let totalLucro = 0

    for (const o of orders) {
      const canal = o.marketplace_accounts?.plataforma || 'outros'
      if (!canaisMap.has(canal)) {
        canaisMap.set(canal, { canal, pedidos: 0, receita: 0, unidades: 0, cmv: 0, comissao: 0, lucro: 0, margem_pct: 0, ticket_medio: 0, share_pct: 0 })
      }
      const c = canaisMap.get(canal)!
      const total = Number(o.total)
      c.pedidos++
      c.receita += total

      // CMV
      let cmvPedido = 0
      let unidadesPedido = 0
      for (const it of o.order_items) {
        if (!it.products) continue
        const custo = pickCusto(it.products.product_prices, canal)
        cmvPedido += custo * it.quantidade
        unidadesPedido += it.quantidade
      }
      c.cmv += cmvPedido
      c.unidades += unidadesPedido

      // Comissão
      let comissaoPedido = 0
      if (canal === 'mercado_livre') {
        // usa comissão diferenciada Full/Agência/Clássico baseada nos itens
        for (const it of o.order_items) {
          const precoItem = Number(it.preco_unitario || 0) * Number(it.quantidade || 1)
          const comissaoUnit = calcularComissao({
            origem: 'mercado_livre',
            valor: precoItem,
            item: { listing: it.products?.marketplace_listings?.[0] },
            comissao_salva: null,
          })
          comissaoPedido += comissaoUnit.valor
        }
        if (o.order_items.length === 0) {
          // fallback se não tem items
          comissaoPedido = total * 0.13
        }
      } else {
        const comissaoPct = COMISSOES[canal] || 5
        comissaoPedido = total * (comissaoPct / 100)
      }
      c.comissao += comissaoPedido

      // Lucro incremental (do pedido) pra total global
      const lucroPedido = total - cmvPedido - comissaoPedido
      c.lucro += lucroPedido

      totalReceita += total
      totalLucro += lucroPedido
    }

    // Calcular métricas finais
    const canais: Canal[] = Array.from(canaisMap.values()).map((c) => ({
      ...c,
      margem_pct: c.receita > 0 ? (c.lucro / c.receita) * 100 : 0,
      ticket_medio: c.pedidos > 0 ? c.receita / c.pedidos : 0,
      share_pct: totalReceita > 0 ? (c.receita / totalReceita) * 100 : 0,
    }))

    // Adicionar canais de sales que não tem orders
    for (const sc of salesChannels) {
      if (!canaisMap.has(sc)) {
        canais.push({ canal: sc, pedidos: 0, receita: 0, unidades: 0, cmv: 0, comissao: 0, lucro: 0, margem_pct: 0, ticket_medio: 0, share_pct: 0 })
      }
    }

    // Top 1 por critério
    const topReceita = [...canais].filter(c => c.receita > 0).sort((a, b) => b.receita - a.receita)[0]
    const topMargem = [...canais].filter(c => c.receita > 0).sort((a, b) => b.margem_pct - a.margem_pct)[0]
    const topLucro = [...canais].filter(c => c.lucro > 0).sort((a, b) => b.lucro - a.lucro)[0]
    const topPedidos = [...canais].filter(c => c.pedidos > 0).sort((a, b) => b.pedidos - a.pedidos)[0]

    return NextResponse.json({
      success: true,
      data: {
        canais: canais.filter(c => c.pedidos > 0 || ['mercado_livre', 'shopee', 'site_b2c', 'whatsapp', 'b2b'].includes(c.canal)),
        resumo: {
          total_receita: totalReceita,
          total_lucro: totalLucro,
          total_pedidos: orders.length,
          margem_media: totalReceita > 0 ? (totalLucro / totalReceita) * 100 : 0,
          canais_ativos: canais.filter(c => c.pedidos > 0).length,
        },
        top: {
          receita: topReceita,
          margem: topMargem,
          lucro: topLucro,
          pedidos: topPedidos,
        },
      },
    })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
