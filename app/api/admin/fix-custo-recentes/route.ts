import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * Pra vendas recentes com custo=0, atualiza o custo_unitario do item
 * buscando do product_prices (ML) ou do product (fallback).
 *
 * GET /api/admin/fix-custo-recentes?days=2
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const days = parseInt(searchParams.get('days') || '2')

    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

    // Acha itens com custo 0 em vendas recentes
    const items = await prisma.order_items.findMany({
      where: {
        OR: [{ custo_unitario: null }, { custo_unitario: 0 }],
        orders: {
          created_at: { gte: cutoff },
        },
      },
      select: {
        id: true,
        sku: true,
        product_id: true,
        quantidade: true,
        custo_unitario: true,
        order_id: true,
      },
      take: 200,
    })

    let updated = 0
    let errors = 0
    const detalhes: any[] = []

    for (const item of items) {
      try {
        // Tenta achar custo via product_prices (canal ML)
        let custo: number | null = null
        const pp = await prisma.product_prices.findFirst({
          where: { product_id: item.product_id ?? undefined, canal: 'mercado_livre' },
          select: { custo: true },
        })
        if (pp?.custo) custo = Number(pp.custo)

        // Fallback: tenta via SKU em todos os product_prices
        if (!custo && item.sku) {
          // Acha product_id pelo sku
          const product = await prisma.products.findUnique({
            where: { sku: item.sku },
            select: { id: true },
          })
          if (product) {
            const pp2 = await prisma.product_prices.findFirst({
              where: { product_id: product.id, canal: 'mercado_livre' },
              select: { custo: true },
            })
            if (pp2?.custo) custo = Number(pp2.custo)
          }
        }

        if (custo && custo > 0) {
          await prisma.order_items.update({
            where: { id: item.id },
            data: { custo_unitario: custo },
          })

          // Recalcula order custo_total
          const orderId = item.order_id
          if (orderId) {
            const allItems = await prisma.order_items.findMany({
              where: { order_id: orderId },
              select: { quantidade: true, custo_unitario: true },
            })
            const custoTotal = allItems
              .filter(i => Number(i.custo_unitario || 0) > 0)
              .reduce((sum, i) => sum + Number(i.custo_unitario || 0) * i.quantidade, 0)
            await prisma.orders.update({
              where: { id: orderId },
              data: { custo_total: custoTotal },
            })
          }

          updated++
          detalhes.push({ sku: item.sku, custo_aplicado: custo, order_id: item.order_id })
        } else {
          detalhes.push({ sku: item.sku, status: 'sem_custo_no_produto', order_id: item.order_id })
        }
      } catch (err: any) {
        errors++
        detalhes.push({ sku: item.sku, erro: err.message })
      }
    }

    return NextResponse.json({
      ok: true,
      total_itens_sem_custo: items.length,
      atualizados: updated,
      errors,
      detalhes: detalhes.slice(0, 50),
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}