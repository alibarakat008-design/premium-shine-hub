/**
 * API: Mercado Envios Full
 * GET /api/ml/full
 *
 * Retorna produtos no FULL e métricas:
 * - Produtos enviados pro FULL
 * - Vendas de produtos FULL
 * - Custo de armazenagem
 * - Saúde (health)
 */

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    // Listings com envio_full = true
    const listings = await prisma.marketplace_listings.findMany({
      where: { envio_full: true },
      include: {
        products: { select: { sku: true, nome: true, foto_principal_url: true, inventory: { select: { quantidade_atual: true, quantidade_minima: true } } } },
      },
    })

    // Calcular vendas FULL
    const productIds = listings.filter(l => l.product_id).map(l => l.product_id!) || []
    const orders = await prisma.orders.findMany({
      where: { order_items: { some: { product_id: { in: productIds } } }, marketplace_account_id: { not: null } },
      select: { total: true, created_at: true, order_items: { where: { product_id: { in: productIds } }, select: { quantidade: true, preco_unitario: true } } },
    })

    let totalVendas = 0
    let receita = 0
    let unidades = 0
    for (const o of orders) {
      totalVendas++
      for (const it of o.order_items) {
        unidades += it.quantidade
        receita += it.quantidade * Number(it.preco_unitario)
      }
    }

    // Custo armazenagem estimado (R$ 90/m³/mês é referência ML)
    const custoArmazenagem = listings.length * 25 // estimativa R$ 25/produto/mês

    // Health
    const healthy = listings.filter(l => Number(l.health || 0) >= 80).length
    const warning = listings.filter(l => { const h = Number(l.health || 0); return h >= 50 && h < 80 }).length
    const critical = listings.filter(l => Number(l.health || 0) < 50).length

    // Estoque FULL
    const estoqueTotal = listings.reduce((acc, l) => acc + Number(l.stock_disponivel_ml || 0), 0)

    return NextResponse.json({
      success: true,
      data: {
        listings: listings.map(l => ({
          id: l.id,
          listing_id: l.listing_id,
          sku: l.products?.sku,
          nome: l.products?.nome,
          foto: l.products?.foto_principal_url,
          preco_atual: l.preco_atual,
          preco_promocional: l.preco_promocional,
          stock_ml: l.stock_disponivel_ml,
          estoque_local: l.products?.inventory?.quantidade_atual,
          health: l.health,
          condition: l.condition,
          vendas_total: l.vendas_total,
        })),
        stats: {
          total_produtos: listings.length,
          total_vendas: totalVendas,
          receita_total: receita,
          unidades_vendidas: unidades,
          ticket_medio: totalVendas > 0 ? receita / totalVendas : 0,
          custo_armazenagem_estimado: custoArmazenagem,
          estoque_total_full: estoqueTotal,
          healthy,
          warning,
          critical,
        },
      },
    })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
