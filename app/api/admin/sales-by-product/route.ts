// Vendas por mês por produto
// Tabela com meses como colunas e produtos como linhas
// + comparativo vs semana passada (%)

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const meses = Number(searchParams.get('meses') || 6)
    const onlyFull = searchParams.get('full') === 'true'
    const limit = Math.min(Number(searchParams.get('limit') || 100), 500)

    const now = new Date()
    const from = new Date(now.getFullYear(), now.getMonth() - meses + 1, 1)

    // Semana passada (para comparativo)
    const lastWeekStart = new Date(now.getTime() - 14 * 24 * 3600 * 1000)
    const lastWeekEnd = new Date(now.getTime() - 7 * 24 * 3600 * 1000)
    const prevWeekStart = new Date(now.getTime() - 21 * 24 * 3600 * 1000)
    const prevWeekEnd = new Date(now.getTime() - 14 * 24 * 3600 * 1000)

    // 1) Buscar items com orders
    const items = await prisma.order_items.findMany({
      where: {
        orders: {
          created_at: { gte: from },
          status: { notIn: ['cancelado', 'devolvido'] },
        },
        ...(onlyFull ? {
          products: {
            marketplace_listings: { some: { envio_full: true } },
          },
        } : {}),
      },
      include: {
        orders: { select: { created_at: true } },
        products: {
          select: {
            id: true,
            sku: true,
            nome: true,
            foto_principal_url: true,
            product_prices: { where: { canal: 'mercado_livre' }, select: { custo: true }, take: 1 },
            marketplace_listings: { where: { envio_full: true }, select: { id: true }, take: 1 },
          },
        },
      },
    })

    // 2) Processar
    type ProdMap = {
      id: string
      sku: string
      nome: string
      foto: string | null
      custo: number
      isFull: boolean
      total: number
      receita: number
      custoTotal: number
      porMes: Record<string, { qtd: number; receita: number }>
      lastWeek: number
      prevWeek: number
    }
    const productMap: Record<string, ProdMap> = {}

    for (const it of items) {
      if (!it.products || !it.orders?.created_at) continue
      const d = new Date(it.orders.created_at)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const pid = it.products.id
      if (!productMap[pid]) {
        const price = it.products.product_prices?.[0]
        productMap[pid] = {
          id: pid,
          sku: it.products.sku,
          nome: it.products.nome,
          foto: it.products.foto_principal_url,
          custo: price?.custo ? Number(price.custo) : 0,
          isFull: (it.products.marketplace_listings?.length || 0) > 0,
          total: 0,
          receita: 0,
          custoTotal: 0,
          porMes: {},
          lastWeek: 0,
          prevWeek: 0,
        }
      }
      const p = productMap[pid]
      const qty = Number(it.quantidade || 1)
      const preco = Number(it.preco_total || 0) > 0
        ? Number(it.preco_total)
        : Number(it.preco_unitario || 0) * qty
      p.total += qty
      p.receita += preco
      p.custoTotal += p.custo * qty
      if (!p.porMes[key]) p.porMes[key] = { qtd: 0, receita: 0 }
      p.porMes[key].qtd += qty
      p.porMes[key].receita += preco

      // Semana passada
      if (d >= lastWeekStart && d < lastWeekEnd) p.lastWeek += qty
      if (d >= prevWeekStart && d < prevWeekEnd) p.prevWeek += qty
    }

    // 3) Montar periodos
    const periods: { ano: number; mes: number; key: string; label: string }[] = []
    for (let i = meses - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      periods.push({
        ano: d.getFullYear(),
        mes: d.getMonth() + 1,
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: MESES[d.getMonth()],
      })
    }

    // 4) Montar lista final
    const produtos = Object.values(productMap).map((p) => {
      const lucro = p.receita - p.custoTotal
      const margem = p.receita > 0 ? (lucro / p.receita) * 100 : 0
      const variacao = p.prevWeek > 0 ? ((p.lastWeek - p.prevWeek) / p.prevWeek) * 100 : (p.lastWeek > 0 ? 999 : 0)
      return {
        ...p,
        lucro: Number(lucro.toFixed(2)),
        margem_pct: Number(margem.toFixed(1)),
        variacao_semana_pct: Number(variacao.toFixed(1)),
        porMes: periods.map((pe) => p.porMes[pe.key] || { qtd: 0, receita: 0 }),
      }
    })

    // 5) Ordenar por receita desc
    produtos.sort((a, b) => b.receita - a.receita)
    const topProdutos = produtos.slice(0, limit)

    return NextResponse.json({
      ok: true,
      periodos: periods.map((p) => p.key),
      labels: periods.map((p) => p.label),
      produtos: topProdutos,
      total_produtos: produtos.length,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message, stack: err.stack }, { status: 500 })
  }
}
