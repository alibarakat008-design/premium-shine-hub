/**
 * Relatório: vendas LABEIRUT (conta bloqueada)
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const BASIC = 'Basic ' + Buffer.from('premium:shine2026').toString('base64')
const LIURA_COMPANY = 'e2633570-74da-4b14-9ca1-ba7b0670e612'
const LABEIRUT_COMPANY = '57d6d2a8-518e-4585-b9bb-cb474ab8ea83'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== BASIC) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // 1) Resumo LABEIRUT — query simples
    const labeurutTotal: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE status != 'cancelado')::int as validas,
        COUNT(*) FILTER (WHERE status = 'cancelado')::int as canceladas,
        MIN(created_at) as primeira,
        MAX(created_at) as ultima,
        COALESCE(SUM(total) FILTER (WHERE status != 'cancelado'), 0)::float as receita_bruta,
        COALESCE(SUM(recebimento_liquido) FILTER (WHERE status != 'cancelado'), 0)::float as recebimento_total,
        COALESCE(SUM(frete) FILTER (WHERE status != 'cancelado'), 0)::float as frete_total,
        COALESCE(SUM(comissao_seller_valor) FILTER (WHERE status != 'cancelado'), 0)::float as comissao_total
      FROM orders
      WHERE company_id = $1::uuid AND origem = 'mercado_livre'::order_origem
    `, LABEIRUT_COMPANY)

    // 2) Produtos LABEIRUT (CTE separada)
    const labeurutProdutos: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        COUNT(DISTINCT oi.product_id)::int as produtos_unicos_vendidos,
        COUNT(DISTINCT oi.product_id) FILTER (WHERE pp.custo > 0)::int as produtos_com_custo,
        COUNT(*)::int as total_items
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      LEFT JOIN product_prices pp
        ON pp.product_id = oi.product_id AND pp.company_id = $1::uuid AND pp.custo > 0
      WHERE o.company_id = $1::uuid
    `, LABEIRUT_COMPANY)

    // 3) Top 30 produtos
    const topProdutos: any[] = await prisma.$queryRawUnsafe(`
      WITH vendas AS (
        SELECT
          oi.product_id,
          oi.quantidade,
          oi.preco_unitario,
          oi.nome_produto,
          oi.sku,
          pp.custo as custo_cadastrado
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        LEFT JOIN product_prices pp
          ON pp.product_id = oi.product_id AND pp.company_id = $1::uuid
        WHERE o.company_id = $1::uuid
          AND o.status != 'cancelado'
          AND oi.product_id IS NOT NULL
      )
      SELECT
        product_id::text as product_id,
        MAX(nome_produto) as produto,
        MAX(sku) as sku,
        MAX(COALESCE(custo_cadastrado, 0))::float as custo_cadastrado,
        SUM(quantidade)::int as qtd_vendida,
        SUM(preco_unitario * quantidade)::float as receita,
        SUM(COALESCE(custo_cadastrado, 0) * quantidade)::float as custo_total
      FROM vendas
      GROUP BY product_id
      ORDER BY receita DESC
      LIMIT 30
    `, LABEIRUT_COMPANY)

    // 4) Evolução mensal
    const evolucao: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') as mes,
        COUNT(*)::int as vendas,
        COUNT(*) FILTER (WHERE status != 'cancelado')::int as validas,
        COALESCE(SUM(total) FILTER (WHERE status != 'cancelado'), 0)::float as receita,
        COALESCE(SUM(recebimento_liquido) FILTER (WHERE status != 'cancelado'), 0)::float as recebimento
      FROM orders
      WHERE company_id = $1::uuid AND origem = 'mercado_livre'::order_origem
      GROUP BY DATE_TRUNC('month', created_at)
      ORDER BY mes ASC
    `, LABEIRUT_COMPANY)

    // 5) Margem bruta
    const lucro: any[] = await prisma.$queryRawUnsafe(`
      WITH vendas AS (
        SELECT
          oi.product_id,
          oi.quantidade,
          oi.preco_unitario,
          pp.custo
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        LEFT JOIN product_prices pp
          ON pp.product_id = oi.product_id AND pp.company_id = $1::uuid AND pp.custo > 0
        WHERE o.company_id = $1::uuid
          AND o.status != 'cancelado'
          AND oi.product_id IS NOT NULL
      )
      SELECT
        COUNT(*)::int as items,
        COALESCE(SUM(quantidade), 0)::int as qtd,
        COALESCE(SUM(preco_unitario * quantidade), 0)::float as receita,
        COALESCE(SUM(COALESCE(custo, 0) * quantidade), 0)::float as custo_total,
        COALESCE(SUM(preco_unitario * quantidade - COALESCE(custo, 0) * quantidade), 0)::float as margem_bruta
      FROM vendas
    `, LABEIRUT_COMPANY)

    const r = lucro[0] || {}

    return NextResponse.json({
      ok: true,
      labeurut_resumo: {
        total_vendas: labeurutTotal[0]?.total || 0,
        vendas_validas: labeurutTotal[0]?.validas || 0,
        canceladas: labeurutTotal[0]?.canceladas || 0,
        primeira_venda: labeurutTotal[0]?.primeira,
        ultima_venda: labeurutTotal[0]?.ultima,
        receita_bruta: labeurutTotal[0]?.receita_bruta || 0,
        recebimento_total: labeurutTotal[0]?.recebimento_total || 0,
        frete_total: labeurutTotal[0]?.frete_total || 0,
        comissao_total: labeurutTotal[0]?.comissao_total || 0,
      },
      produtos: {
        unicos_vendidos: labeurutProdutos[0]?.produtos_unicos_vendidos || 0,
        com_custo_cadastrado: labeurutProdutos[0]?.produtos_com_custo || 0,
        total_items_vendidos: labeurutProdutos[0]?.total_items || 0,
      },
      margem_bruta_se_custo_cadastrado: {
        items_com_custo: r.items || 0,
        qtd_total: r.qtd || 0,
        receita: r.receita || 0,
        custo_total: r.custo_total || 0,
        margem_bruta_reais: r.margem_bruta || 0,
        margem_bruta_pct: (r.receita || 0) > 0 ? Math.round(((r.margem_bruta || 0) / r.receita) * 10000) / 100 : 0,
        observacao: 'Custo_fornecedor (preço que LIURA vendeu pro LABEIRUT) não existe no schema ainda. Esse número é o lucro bruto do LABEIRUT se o custo que ele cadastrou for igual ao que ele pagou pra LIURA.',
      },
      top_30_produtos: topProdutos,
      evolucao_mensal: evolucao,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message, stack: err.stack?.substring(0, 800) }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}
