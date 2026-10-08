/**
 * API: Kits / Bundles
 * GET /api/kits
 * POST /api/kits
 *   Body: { nome, descricao, sku, preco_venda, items: [{ product_id, quantidade }] }
 * PUT /api/kits?id=xxx
 * DELETE /api/kits?id=xxx
 *
 * Kit = produto composto por N outros produtos
 * - Custo total = soma(qtd * custo_unitário)
 * - Margem = ((preco_venda - custo_total) / preco_venda) * 100
 * - Estoque virtual = min(estoque_cada_item / qtd)
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const bundles = await prisma.product_bundles.findMany({
      orderBy: { created_at: 'desc' },
      include: {
        items: {
          include: {
            products: { select: { sku: true, nome: true, inventory: { select: { quantidade_atual: true } } } },
          },
        },
      },
    })
    return NextResponse.json({ success: true, data: bundles })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { nome, descricao, sku, preco_venda, items } = body

    if (!nome) return NextResponse.json({ success: false, error: 'Nome obrigatório' }, { status: 400 })
    if (!items || items.length === 0) return NextResponse.json({ success: false, error: 'Adicione ao menos 1 item' }, { status: 400 })

    // Calcular custo e estoque
    let custoTotal = 0
    let estoqueVirtual = Infinity
    for (const it of items) {
      const mlPrice = await prisma.product_prices.findFirst({ where: { product_id: it.product_id, canal: 'mercado_livre' } })
      const custo = mlPrice?.custo ? Number(mlPrice.custo.toString()) : 0
      const inv = await prisma.inventory.findUnique({ where: { product_id: it.product_id } })
      const estoque = inv?.quantidade_atual || 0
      custoTotal += custo * (it.quantidade || 1)
      const possivel = Math.floor(estoque / (it.quantidade || 1))
      if (possivel < estoqueVirtual) estoqueVirtual = possivel
    }
    if (estoqueVirtual === Infinity) estoqueVirtual = 0

    const margem = preco_venda > 0 ? ((preco_venda - custoTotal) / preco_venda) * 100 : 0

    const bundle = await prisma.product_bundles.create({
      data: {
        nome,
        descricao: descricao || null,
        sku: sku || `KIT-${Date.now()}`,
        preco_venda,
        custo_total: custoTotal,
        margem_pct: margem,
        estoque_virtual: estoqueVirtual,
        items: {
          create: items.map((it: any) => ({
            product_id: it.product_id,
            quantidade: it.quantidade || 1,
          })),
        },
      },
      include: { items: true },
    })

    return NextResponse.json({ success: true, message: `Kit criado! Margem: ${margem.toFixed(1)}%`, data: bundle })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ success: false, error: 'id obrigatório' }, { status: 400 })
    await prisma.product_bundles.delete({ where: { id } })
    return NextResponse.json({ success: true, message: 'Kit removido' })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
