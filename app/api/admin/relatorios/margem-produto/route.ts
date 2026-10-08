/**
 * Relatório de Margem por Produto (SKU)
 *
 * GET /api/admin/relatorios/margem-produto?meses=3&limite=100
 *
 * Cruza:
 * - CMV (Custo da Mercadoria Vendida) por unidade
 * - Preço médio de venda
 * - Quantidade vendida
 * - Lucro e margem %
 *
 * Retorna top produtos ordenados por:
 * - mais vendidos
 * - menor margem (alerta)
 * - maior lucro absoluto
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { pickCusto } from '@/lib/custos'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const meses = parseInt(searchParams.get('meses') || '3', 10)
    const limite = parseInt(searchParams.get('limite') || '100', 10)
    const ordenar = searchParams.get('ordenar') || 'qtd' // qtd | margem | lucro

    const dataInicio = new Date()
    dataInicio.setMonth(dataInicio.getMonth() - meses)

    // 1) Top produtos por quantidade vendida no período
    const topVendidos = await prisma.order_items.groupBy({
      by: ['product_id'],
      where: {
        product_id: { not: null },
        orders: {
          created_at: { gte: dataInicio },
          status: { notIn: ['cancelado', 'devolvido'] },
        },
      },
      _sum: {
        quantidade: true,
        preco_unitario: true,
        preco_total: true,
      },
      orderBy: { _sum: { quantidade: 'desc' } },
      take: limite,
    })

    // 2) Buscar info de cada produto + custo + estoque (via SQL pra pegar estoque ML)
    const productIds = topVendidos.map((v) => v.product_id!).filter(Boolean)
    if (productIds.length === 0) {
      return NextResponse.json({ ok: true, periodo_meses: meses, total_produtos: 0, resumo: { receita_bruta: 0, lucro_bruto: 0, margem_media_pct: 0, produtos_alerta_margem: 0 }, produtos: [] })
    }
    const placeholders = productIds.map((_, i) => `$${i + 1}::uuid`).join(',')
    const produtosRaw = await prisma.$queryRawUnsafe(`
      SELECT
        p.id, p.sku, p.nome, p.ean,
        b.nome as marca,
        COALESCE(SUM(ml.stock_disponivel_ml), 0)::int as estoque,
        (
          SELECT json_agg(json_build_object('custo', pp.custo, 'preco_venda', pp.preco_venda, 'canal', pp.canal))
          FROM product_prices pp WHERE pp.product_id = p.id
        ) as precos
      FROM products p
      LEFT JOIN brands b ON b.id = p.marca_id
      LEFT JOIN marketplace_listings ml ON ml.product_id = p.id
      WHERE p.id IN (${placeholders})
      GROUP BY p.id, p.sku, p.nome, p.ean, b.nome
    `, ...productIds) as any[]

    const produtoMap = new Map(produtosRaw.map((p) => [p.id, p]))

    // 3) Cruzar vendas × CMV
    const resultados = topVendidos
      .map((v) => {
        const p = produtoMap.get(v.product_id!)
        if (!p) return null

        const qtd = v._sum.quantidade || 0
        const receita = Number(v._sum.preco_total || 0)
        const precoMedio = qtd > 0 ? receita / qtd : 0
        const custoUnitario = Number(pickCusto(p.precos, 'mercado_livre') || 0)
        const cmvTotal = custoUnitario * qtd
        const lucro = receita - cmvTotal
        const margemPct = receita > 0 ? (lucro / receita) * 100 : 0

        return {
          id: p.id,
          sku: p.sku,
          nome: p.nome,
          marca: p.brands?.nome,
          ean: p.ean,
          qtd_vendida: qtd,
          receita_bruta: Number(receita.toFixed(2)),
          preco_medio: Number(precoMedio.toFixed(2)),
          custo_unitario: Number(custoUnitario.toFixed(2)),
          cmv_total: Number(cmvTotal.toFixed(2)),
          lucro_bruto: Number(lucro.toFixed(2)),
          margem_pct: Number(margemPct.toFixed(2)),
          estoque: p.estoque || 0,
          // Sugestão: se margem < 20% e qtd > 50 → alerta de preço
          alerta:
            margemPct < 20 && qtd > 50
              ? '⚠️ Margem baixa em produto alto volume — considerar reajuste'
              : margemPct > 60
              ? '✅ Margem alta'
              : 'OK',
        }
      })
      .filter(Boolean) as any[]

    // Ordenar
    if (ordenar === 'margem') {
      resultados.sort((a, b) => a.margem_pct - b.margem_pct) // menor margem primeiro
    } else if (ordenar === 'lucro') {
      resultados.sort((a, b) => b.lucro_bruto - a.lucro_bruto)
    } else {
      resultados.sort((a, b) => b.qtd_vendida - a.qtd_vendida)
    }

    // Resumo
    const totalReceita = resultados.reduce((s, r) => s + r.receita_bruta, 0)
    const totalLucro = resultados.reduce((s, r) => s + r.lucro_bruto, 0)
    const margemMedia =
      totalReceita > 0 ? Number(((totalLucro / totalReceita) * 100).toFixed(2)) : 0
    const alertas = resultados.filter((r) => r.margem_pct < 20 && r.qtd_vendida > 50).length

    return NextResponse.json({
      ok: true,
      periodo_meses: meses,
      total_produtos: resultados.length,
      resumo: {
        receita_bruta: Number(totalReceita.toFixed(2)),
        lucro_bruto: Number(totalLucro.toFixed(2)),
        margem_media_pct: margemMedia,
        produtos_alerta_margem: alertas,
      },
      produtos: resultados,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
