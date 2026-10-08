/**
 * =====================================================
 * CRON DE REESTOQUE — Detecta produtos críticos
 * e gera pedido sugerido ao fornecedor
 * =====================================================
 * Roda uma vez por dia, gera sugestões de compra
 * baseadas em:
 *   - Vendas dos últimos 30 dias
 *   - Estoque atual vs mínimo
 *   - Prazo de entrega do fornecedor
 *
 * Salva em supplier_purchases com status 'sugerida'
 * Você aprova/recusa depois
 * =====================================================
 */

// app/api/cron/sugerir-compras/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export const maxDuration = 300

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || ''
  const isCronSecret = authHeader === `Bearer ${process.env.CRON_SECRET || ''}`
  const isBasicAuth = authHeader.startsWith('Basic ')
  if (!isCronSecret && !isBasicAuth) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  try {
    console.log('[Cron] Gerando sugestões de compra...')

    // 1) Calcular vendas médias por SKU (últimos 30 dias)
    const vendasPorSKU = await prisma.$queryRaw<any[]>`
      SELECT
        p.id,
        p.sku,
        p.nome,
        p.fornecedor_id,
        i.quantidade_atual,
        i.quantidade_minima,
        i.quantidade_maxima,
        COALESCE(AVG(oi.quantidade)::DECIMAL, 0) as vendas_dia,
        f.prazo_entrega_dias,
        f.pedido_minimo_valor
      FROM products p
      JOIN inventory i ON p.id = i.product_id
      LEFT JOIN order_items oi ON p.id = oi.product_id
      LEFT JOIN orders o ON oi.order_id = o.id
        AND o.created_at > NOW() - INTERVAL '30 days'
        AND o.status NOT IN ('cancelado', 'devolvido')
      LEFT JOIN suppliers f ON p.fornecedor_id = f.id
      WHERE p.ativo = true
      GROUP BY p.id, p.sku, p.nome, p.fornecedor_id, i.quantidade_atual,
               i.quantidade_minima, i.quantidade_maxima, f.prazo_entrega_dias, f.pedido_minimo_valor
    `

    // 2) Agrupar por fornecedor
    const porFornecedor: Record<string, any> = {}

    for (const p of vendasPorSKU) {
      if (!p.fornecedor_id) continue

      // Cobertura atual em dias
      const coberturaDias = p.vendas_dia > 0 ? p.quantidade_atual / p.vendas_dia : 999

      // Se cobertura < (prazo_fornecedor + 15 dias), precisa repor
      const precisaRepor = coberturaDias < (p.prazo_entrega_dias || 7) + 15

      if (!precisaRepor) continue

      // Quanto comprar: trazer estoque para máximo
      const maximo = p.quantidade_maxima || p.quantidade_minima * 4
      const comprar = Math.max(0, maximo - p.quantidade_atual)

      if (comprar === 0) continue

      if (!porFornecedor[p.fornecedor_id]) {
        porFornecedor[p.fornecedor_id] = {
          fornecedor_id: p.fornecedor_id,
          itens: [],
          valor_total: 0,
        }
      }

      // Buscar custo (do inventory ou do product_price)
      const custo = await getCustoProduto(p.id)
      const valorItem = comprar * custo

      porFornecedor[p.fornecedor_id].itens.push({
        product_id: p.id,
        sku: p.sku,
        nome: p.nome,
        quantidade_atual: p.quantidade_atual,
        comprar_quantidade: comprar,
        custo_unitario: custo,
        valor_total: valorItem,
      })
      porFornecedor[p.fornecedor_id].valor_total += valorItem
    }

    // 3) Criar pedido sugerido pra cada fornecedor (se atingir pedido mínimo)
    const pedidosCriados = []

    for (const forn of Object.values(porFornecedor) as any[]) {
      if (forn.valor_total < 100) continue // não criar pedido < R$ 100

      const purchase = await prisma.supplier_purchases.create({
        data: {
          supplier_id: forn.fornecedor_id,
          status: 'sugerida',
          valor_total: forn.valor_total,
          sugerido_por_bi: true,
          condicao_pagamento: 'A combinar',
          supplier_purchase_items: {
            create: forn.itens.map((item: any) => ({
              product_id: item.product_id,
              quantidade: item.comprar_quantidade,
              custo_unitario: item.custo_unitario,
              custo_total: item.valor_total,
            })),
          },
        },
      })

      pedidosCriados.push({
        id: purchase.id,
        fornecedor_id: forn.fornecedor_id,
        valor: forn.valor_total,
        itens: forn.itens.length,
      })

      // Criar alerta
      await prisma.system_alerts.create({
        data: {
          tipo: 'compra_sugerida',
          severidade: 'info',
          titulo: `Pedido sugerido ao fornecedor`,
          mensagem: `${forn.itens.length} produtos precisam de reposição. Valor: R$ ${forn.valor_total.toFixed(2)}. Aprove em /admin/compras`,
        },
      })
    }

    console.log(`[Cron] ${pedidosCriados.length} pedidos sugeridos criados`)

    return NextResponse.json({
      success: true,
      pedidos_criados: pedidosCriados.length,
      pedidos: pedidosCriados,
    })
  } catch (err: any) {
    console.error('[Cron Compras]', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}

async function getCustoProduto(productId: string): Promise<number> {
  const inv = await prisma.inventory.findFirst({
    where: { product_id: productId },
  })
  return inv?.custo_medio ? Number(inv.custo_medio) : 0
}
