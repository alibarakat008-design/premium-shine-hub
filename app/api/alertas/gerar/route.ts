/**
 * API: Geração de Alertas Inteligentes
 * POST /api/alertas/gerar
 *
 * Roda várias regras e cria smart_alerts automaticamente
 */

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST() {
  try {
    const criados: any[] = []

    // 1) PREÇO FORA DA FAIXA (custo * 1.2)
    const prices = await prisma.product_prices.findMany({
      where: { canal: 'mercado_livre' },
      include: { products: { select: { id: true, sku: true, nome: true, ativo: true } } },
    })
    for (const p of prices) {
      if (!p.custo || !p.preco_venda || !p.products?.ativo) continue
      const custo = Number(p.custo.toString())
      const preco = Number(p.preco_venda.toString())
      const min = custo * 1.2
      if (preco < min) {
        // Evitar duplicados: mesmo tipo + entity_id nas últimas 24h
        const existe = await prisma.smart_alerts.findFirst({
          where: { tipo: 'preco_fora', entidade_id: p.products.id, created_at: { gte: new Date(Date.now() - 24 * 3600 * 1000) } },
        })
        if (!existe) {
          const a = await prisma.smart_alerts.create({
            data: {
              tipo: 'preco_fora',
              severidade: 'warning',
              titulo: `Preço abaixo do mínimo: ${p.products.sku}`,
              mensagem: `Preço atual R$ ${preco.toFixed(2)} está abaixo do mínimo (R$ ${min.toFixed(2)} = custo × 1.2). Margem baixa ou prejuízo.`,
              entidade_tipo: 'product',
              entidade_id: p.products.id,
              acao_url: `/admin/produtos/${p.products.id}`,
            },
          })
          criados.push(a)
        }
      }
    }

    // 2) ESTOQUE CRÍTICO
    const inventories = await prisma.inventory.findMany({
      include: { products: { select: { id: true, sku: true, nome: true, ativo: true } } },
    })
    for (const inv of inventories) {
      if (!inv.products?.ativo) continue
      const qty = inv.quantidade_atual || 0
      const minimo = inv.quantidade_minima || 5
      if (qty <= minimo) {
        const existe = await prisma.smart_alerts.findFirst({
          where: { tipo: 'estoque_critico', entidade_id: inv.products.id, resolvido: false },
        })
        if (!existe) {
          const a = await prisma.smart_alerts.create({
            data: {
              tipo: 'estoque_critico',
              severidade: qty === 0 ? 'critical' : 'warning',
              titulo: `Estoque ${qty === 0 ? 'ZERADO' : 'crítico'}: ${inv.products.sku}`,
              mensagem: `Estoque atual: ${qty} un. (mínimo: ${minimo}). ${qty === 0 ? 'Vendas serão pausadas em breve!' : 'Reposição urgente.'}`,
              entidade_tipo: 'product',
              entidade_id: inv.products.id,
              acao_url: `/admin/produtos/${inv.products.id}`,
            },
          })
          criados.push(a)
        }
      }
    }

    // 3) GIRO LENTO (sem vendas há 60+ dias)
    const sessentaDiasAtras = new Date(Date.now() - 60 * 24 * 3600 * 1000)
    const produtosAtivos = await prisma.products.findMany({
      where: { ativo: true },
      include: {
        order_items: {
          where: { orders: { created_at: { gte: sessentaDiasAtras } } },
          select: { id: true },
        },
      },
      take: 500,
    })
    for (const p of produtosAtivos) {
      if (p.order_items.length === 0) {
        const existe = await prisma.smart_alerts.findFirst({
          where: { tipo: 'giro_lento', entidade_id: p.id, resolvido: false },
        })
        if (!existe) {
          const a = await prisma.smart_alerts.create({
            data: {
              tipo: 'giro_lento',
              severidade: 'info',
              titulo: `Sem vendas há 60+ dias: ${p.sku}`,
              mensagem: `${p.nome} - considere promoção ou avaliar descontinuidade.`,
              entidade_tipo: 'product',
              entidade_id: p.id,
              acao_url: `/admin/produtos/${p.id}`,
            },
          })
          criados.push(a)
        }
      }
    }

    return NextResponse.json({ success: true, message: `${criados.length} alertas criados`, data: { criados: criados.length } })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
