// API: /api/admin/stats
// Retorna estatísticas gerais do sistema

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {

  try {
    const [produtos, marcas, categorias, usuarios, pedidos] = await Promise.all([
      prisma.products.count(),
      prisma.brands.count(),
      prisma.categories.count(),
      prisma.users.count(),
      prisma.orders.count(),
    ])

    // Top 5 marcas por número de produtos
    const topMarcas = await prisma.products.groupBy({
      by: ['marca_id'],
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 5,
    })

    // Buscar nomes das marcas top
    const marcaIds = topMarcas.map(m => m.marca_id).filter(Boolean)
    const marcasTop = await prisma.brands.findMany({
      where: { id: { in: marcaIds } },
    })
    const marcaMap = Object.fromEntries(marcasTop.map(m => [m.id, m.nome]))

    // Top categorias
    const topCategorias = await prisma.products.groupBy({
      by: ['categoria_id'],
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 5,
    })

    const catIds = topCategorias.map(c => c.categoria_id).filter(Boolean)
    const catsTop = await prisma.categories.findMany({
      where: { id: { in: catIds } },
    })
    const catMap = Object.fromEntries(catsTop.map(c => [c.id, c.nome]))

    // Valor total em estoque
    const precos = await prisma.product_prices.findMany({
      where: { canal: 'site_b2c' },
      select: { preco_venda: true, product_id: true },
    })
    const stocks = await prisma.inventory.findMany({
      select: { product_id: true, quantidade_atual: true, custo_medio: true },
    })
    const stockMap = Object.fromEntries(stocks.map(s => [s.product_id, s]))
    const precoMap = Object.fromEntries(precos.map(p => [p.product_id, parseFloat(p.preco_venda.toString())]))

    let valorEstoque = 0
    let valorVenda = 0
    for (const p of precos) {
      const stock = stockMap[p.product_id]
      if (stock) {
        valorEstoque += (parseFloat(stock.custo_medio?.toString() || '0')) * stock.quantidade_atual
        valorVenda += precoMap[p.product_id] * stock.quantidade_atual
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        totais: {
          produtos,
          marcas,
          categorias,
          usuarios,
          pedidos,
        },
        top_marcas: topMarcas
          .filter(m => m.marca_id)
          .map(m => ({
            marca_id: m.marca_id,
            marca: marcaMap[m.marca_id] || 'Desconhecida',
            total: m._count.id,
          })),
        top_categorias: topCategorias
          .filter(c => c.categoria_id)
          .map(c => ({
            categoria_id: c.categoria_id,
            categoria: catMap[c.categoria_id] || 'Desconhecida',
            total: c._count.id,
          })),
        estoque: {
          valor_custo: Math.round(valorEstoque * 100) / 100,
          valor_venda: Math.round(valorVenda * 100) / 100,
          margem_potencial: Math.round((valorVenda - valorEstoque) * 100) / 100,
        },
      },
    })
  } catch (err: any) {
    console.error('[API /admin/stats]', err)
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    )
  }
}
