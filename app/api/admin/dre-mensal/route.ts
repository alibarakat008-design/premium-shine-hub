/**
 * DRE mensal por empresa (LIURA default)
 *
 * GET /api/admin/dre-mensal?company_id=e2633570-...&from=2026-01-01
 *
 * Por mês: receita, comissão, frete, recebimento, CMV, custo_flex, lucro, margem
 * + Detalha vendas SEM custo (pra você saber quanto tá "voando" sem CMV)
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const BASIC = 'Basic ' + Buffer.from('premium:shine2026').toString('base64')
const LIURA = 'e2633570-74da-4b14-9ca1-ba7b0670e612'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== BASIC) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }
  const { searchParams } = new URL(req.url)
  const companyId = searchParams.get('company_id') || LIURA
  const from = searchParams.get('from') || '2026-01-01'

  try {
    // 1) DRE mensal agregado
    const dre: any[] = await prisma.$queryRawUnsafe(`
      WITH vendas_mes AS (
        SELECT
          TO_CHAR(DATE_TRUNC('month', o.created_at), 'YYYY-MM') as mes,
          o.id,
          o.order_number,
          o.total::float,
          o.comissao_seller_valor::float as comissao,
          o.frete::float as frete,
          o.custo_flex::float as custo_flex,
          o.bonus_envio_valor::float as bonus_envio,
          o.bonus_cupom_valor::float as bonus_cupom,
          o.tarifa_pct_valor::float as tarifa_pct,
          o.tarifa_fixa_valor::float as tarifa_fixa,
          o.recebimento_liquido::float as recebimento,
          o.status
        FROM orders o
        WHERE o.company_id = $1::uuid
          AND o.origem = 'mercado_livre'::order_origem
          AND o.status != 'cancelado'
          AND o.created_at >= $2::date
      ),
      cmv_por_venda AS (
        SELECT
          oi.order_id,
          COALESCE(SUM(oi.custo_unitario * oi.quantidade), 0)::float as cmv
        FROM order_items oi
        WHERE oi.custo_unitario IS NOT NULL AND oi.custo_unitario > 0
        GROUP BY oi.order_id
      ),
      resumo_mes AS (
        SELECT
          v.mes,
          COUNT(*)::int as vendas,
          COALESCE(SUM(v.total), 0)::float as receita_bruta,
          COALESCE(SUM(v.comissao), 0)::float as comissao,
          COALESCE(SUM(v.frete), 0)::float as frete,
          COALESCE(SUM(v.custo_flex), 0)::float as custo_flex,
          COALESCE(SUM(v.bonus_envio), 0)::float as bonus_envio,
          COALESCE(SUM(v.bonus_cupom), 0)::float as bonus_cupom,
          COALESCE(SUM(v.recebimento), 0)::float as recebimento,
          COALESCE(SUM(c.cmv), 0)::float as cmv
        FROM vendas_mes v
        LEFT JOIN cmv_por_venda c ON c.order_id = v.id
        GROUP BY v.mes
        ORDER BY v.mes
      )
      SELECT *,
        (recebimento - cmv - custo_flex) as lucro,
        CASE WHEN (recebimento - cmv - custo_flex) > 0 AND cmv > 0
          THEN ROUND((recebimento - cmv - custo_flex) / cmv * 100)::numeric
          ELSE 0
        END as margem_pct
      FROM resumo_mes
    `, companyId, from)

    // 2) Vendas SEM custo (que tão derrubando o lucro)
    const semCusto: any[] = await prisma.$queryRawUnsafe(`
      WITH itens_venda AS (
        SELECT
          o.id as order_id,
          o.order_number,
          o.created_at,
          o.total::float as total,
          o.recebimento_liquido::float as recebimento,
          COUNT(oi.id)::int as qtd_itens,
          COALESCE(SUM(oi.quantidade), 0)::int as qtd_unidades,
          COALESCE(SUM(CASE WHEN oi.custo_unitario IS NULL OR oi.custo_unitario = 0
            THEN 1 ELSE 0 END), 0)::int as itens_sem_custo,
          COALESCE(SUM(oi.custo_unitario * oi.quantidade), 0)::float as cmv_total
        FROM orders o
        LEFT JOIN order_items oi ON oi.order_id = o.id
        WHERE o.company_id = $1::uuid
          AND o.origem = 'mercado_livre'::order_origem
          AND o.status != 'cancelado'
          AND o.created_at >= $2::date
        GROUP BY o.id, o.order_number, o.created_at, o.total, o.recebimento_liquido
      )
      SELECT
        TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') as mes,
        COUNT(*)::int as vendas_sem_custo,
        COALESCE(SUM(recebimento), 0)::float as recebimento_total,
        COALESCE(SUM(total), 0)::float as receita_total
      FROM itens_venda
      WHERE cmv_total = 0 OR cmv_total IS NULL
      GROUP BY DATE_TRUNC('month', created_at)
      ORDER BY mes
    `, companyId, from)

    // 3) Top 30 produtos SEM custo cadastrado
    const topSemCusto: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        oi.product_id::text as product_id,
        MAX(p.sku) as sku,
        MAX(oi.nome_produto) as produto,
        COUNT(DISTINCT oi.order_id)::int as vendas,
        SUM(oi.quantidade)::int as unidades,
        SUM(oi.preco_unitario * oi.quantidade)::float as receita,
        COALESCE(MAX(pp.custo), 0)::float as custo_atual
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      LEFT JOIN products p ON p.id = oi.product_id
      LEFT JOIN product_prices pp
        ON pp.product_id = oi.product_id
        AND pp.company_id = $1::uuid
        AND pp.custo > 0
      WHERE o.company_id = $1::uuid
        AND o.origem = 'mercado_livre'::order_origem
        AND o.status != 'cancelado'
        AND o.created_at >= $2::date
        AND oi.product_id IS NOT NULL
      GROUP BY oi.product_id
      HAVING COALESCE(MAX(pp.custo), 0) = 0
      ORDER BY receita DESC
      LIMIT 30
    `, companyId, from)

    // 4) Totais
    const totais = dre.reduce(
      (acc, m) => ({
        vendas: acc.vendas + m.vendas,
        receita_bruta: acc.recebimento_bruta + (m.receita_bruta || 0),
        comissao: acc.comissao + (m.comissao || 0),
        frete: acc.frete + (m.frete || 0),
        custo_flex: acc.custo_flex + (m.custo_flex || 0),
        recebimento: acc.recebimento + (m.recebimento || 0),
        cmv: acc.cmv + (m.cmv || 0),
        lucro: acc.lucro + (Number(m.lucro) || 0),
      }),
      { vendas: 0, receita_bruta: 0, comissao: 0, frete: 0, custo_flex: 0, recebimento: 0, cmv: 0, lucro: 0 }
    )

    const totaisSemCusto = semCusto.reduce(
      (acc, m) => ({
        vendas_sem_custo: acc.vendas_sem_custo + m.vendas_sem_custo,
        recebimento: acc.recebimento + m.recebimento_total,
      }),
      { vendas_sem_custo: 0, recebimento: 0 }
    )

    return NextResponse.json({
      ok: true,
      company_id: companyId,
      from,
      dre_mensal: dre,
      vendas_sem_custo_por_mes: semCusto,
      top_30_produtos_sem_custo: topSemCusto,
      totais,
      totais_sem_custo: totaisSemCusto,
      observacao: 'CMV = soma(order_items.custo_unitario * quantidade). Vendas SEM custo aparecem com CMV=0 e lucro = recebimento (margem 100% que não é real). Cadastre o custo em /admin/meus-custos pra ter o número real.',
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message, stack: err.stack?.substring(0, 500) }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}
