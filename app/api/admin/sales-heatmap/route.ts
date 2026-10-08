// GET /api/admin/sales-heatmap
// Retorna:
// - matrix 7x24: vendas por (dia da semana) x (hora)
// - produtos_parados: produtos sem vendas há 30+ dias
// - margem_baixa: produtos com margem < 15%

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const days = Number(searchParams.get('days') || 30)

    // MULTI-TENANT: filtra por company_id (cookie OU query)
    const companyId = req.cookies.get('psh_session_company')?.value
      || req.cookies.get('psh_session_active_company')?.value
      || searchParams.get('company_id')
      || null

    const from = new Date(Date.now() - days * 24 * 3600 * 1000)

    // 1) Heatmap 7x24
    const ordersWhere: any = {
      created_at: { gte: from },
      status: { notIn: ['cancelado', 'devolvido'] },
    }
    if (companyId) ordersWhere.company_id = companyId
    const orders = await prisma.orders.findMany({
      where: ordersWhere,
      select: { created_at: true, total: true },
    })

    // matrix[dia_semana][hora] = { count, receita }
    const matrix: { count: number; receita: number }[][] = Array.from({ length: 7 }, () =>
      Array.from({ length: 24 }, () => ({ count: 0, receita: 0 }))
    )
    for (const o of orders) {
      if (!o.created_at) continue
      const d = new Date(o.created_at)
      const dia = d.getDay() // 0=dom
      const hora = d.getHours()
      matrix[dia][hora].count++
      matrix[dia][hora].receita += Number(o.total || 0)
    }

    // 2) Produtos parados (sem vendas há 30+ dias)
    // Vou pegar os top 50 produtos que tiveram vendas em algum momento
    // e checar quando foi a última venda
    const produtosWhere: any = {
      orders: {
        created_at: { gte: new Date(Date.now() - 365 * 24 * 3600 * 1000) },
        status: { notIn: ['cancelado', 'devolvido'] },
      },
    }
    if (companyId) produtosWhere.orders.company_id = companyId
    const productsWithSales = await prisma.order_items.findMany({
      where: produtosWhere,
      select: {
        product_id: true,
        orders: { select: { created_at: true } },
        products: {
          select: { id: true, sku: true, nome: true, foto_principal_url: true, product_prices: { where: { canal: 'mercado_livre' }, select: { custo: true, preco_venda: true }, take: 1 } },
        },
      },
      take: 5000,
      orderBy: { id: 'desc' },
    })

    const productLastSale: Record<string, { id: string; sku: string; nome: string; foto: string | null; custo: number; preco: number; ultima_venda: string | null; vendas_total: number }> = {}
    for (const it of productsWithSales) {
      if (!it.products || !it.orders?.created_at) continue
      const k = it.products.id
      if (!productLastSale[k]) {
        const price = it.products.product_prices?.[0]
        productLastSale[k] = {
          id: k,
          sku: it.products.sku,
          nome: it.products.nome,
          foto: it.products.foto_principal_url,
          custo: price?.custo ? Number(price.custo) : 0,
          preco: price?.preco_venda ? Number(price.preco_venda) : 0,
          ultima_venda: null,
          vendas_total: 0,
        }
      }
      const venda = new Date(it.orders.created_at)
      const atual = productLastSale[k].ultima_venda ? new Date(productLastSale[k].ultima_venda!) : null
      if (!atual || venda > atual) {
        productLastSale[k].ultima_venda = venda.toISOString()
      }
      productLastSale[k].vendas_total++
    }

    const diasParado = 30
    const limite = new Date(Date.now() - diasParado * 24 * 3600 * 1000)
    const produtosParados = Object.values(productLastSale)
      .filter((p) => p.ultima_venda && new Date(p.ultima_venda) < limite)
      .map((p) => ({
        ...p,
        dias_parado: Math.floor((Date.now() - new Date(p.ultima_venda!).getTime()) / (24 * 3600 * 1000)),
      }))
      .sort((a, b) => b.dias_parado - a.dias_parado)
      .slice(0, 30)

    // 3) Margem baixa
    // Produtos com preço e custo cadastrados
    const produtosComPreco = await prisma.product_prices.findMany({
      where: { canal: 'mercado_livre', preco_venda: { gt: 0 }, custo: { gt: 0 } },
      include: {
        products: {
          select: { id: true, sku: true, nome: true, foto_principal_url: true },
        },
      },
      take: 1000,
    })

    const margemBaixa = produtosComPreco
      .map((p) => {
        const custo = Number(p.custo || 0)
        const preco = Number(p.preco_venda || 0)
        const margemPct = preco > 0 ? ((preco - custo) / preco) * 100 : 0
        return {
          product_id: p.products?.id,
          sku: p.products?.sku,
          nome: p.products?.nome,
          foto: p.products?.foto_principal_url,
          custo,
          preco,
          margem_pct: Number(margemPct.toFixed(1)),
        }
      })
      .filter((p) => p.margem_pct < 15 && p.margem_pct >= 0)
      .sort((a, b) => a.margem_pct - b.margem_pct)
      .slice(0, 30)

    return NextResponse.json({
      ok: true,
      heatmap: {
        dias: DIAS_SEMANA,
        matrix: matrix.map((row) => row.map((cell) => ({ count: cell.count, receita: Number(cell.receita.toFixed(2)) }))),
        max_count: Math.max(...matrix.flat().map((c) => c.count), 1),
        total: orders.length,
      },
      produtos_parados: {
        dias_limite: diasParado,
        count: produtosParados.length,
        items: produtosParados,
      },
      margem_baixa: {
        count: margemBaixa.length,
        items: margemBaixa,
      },
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message, stack: err.stack }, { status: 500 })
  }
}
