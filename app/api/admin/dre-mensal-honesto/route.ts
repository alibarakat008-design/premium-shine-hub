/**
 * Refaz o DRE de forma HONESTA: só conta CMV real de items com custo > 0
 * - Total de vendas (válidas)
 * - Vendas com CMV parcial (alguns items sem custo)
 * - Vendas SEM custo nenhum (todos items NULL/0)
 * - CMV real (soma apenas items com custo)
 * - Lucro real
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
    // DRE mensal HONESTO: separa vendas em 3 categorias
    const dre: any[] = await prisma.$queryRawUnsafe(`
      WITH itens_por_venda AS (
        SELECT
          o.id as order_id,
          o.order_number,
          o.created_at,
          o.total::float as total,
          o.recebimento_liquido::float as recebimento,
          o.custo_flex::float as custo_flex,
          o.status,
          COUNT(oi.id)::int as qtd_itens,
          COALESCE(SUM(oi.quantidade), 0)::int as qtd_unidades,
          COALESCE(SUM(oi.custo_unitario * oi.quantidade), 0)::float as cmv_real,
          COUNT(*) FILTER (WHERE oi.custo_unitario IS NULL OR oi.custo_unitario = 0)::int as itens_sem_custo
        FROM orders o
        LEFT JOIN order_items oi ON oi.order_id = o.id
        WHERE o.company_id = $1::uuid
          AND o.origem = 'mercado_livre'::order_origem
          AND o.status != 'cancelado'
          AND o.created_at >= $2::date
        GROUP BY o.id, o.order_number, o.created_at, o.total, o.recebimento_liquido, o.custo_flex, o.status
      ),
      resumo_mes AS (
        SELECT
          TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') as mes,
          COUNT(*)::int as vendas_total,
          COALESCE(SUM(total), 0)::float as receita_bruta,
          COALESCE(SUM(recebimento), 0)::float as recebimento,
          COALESCE(SUM(custo_flex), 0)::float as custo_flex,
          COALESCE(SUM(cmv_real), 0)::float as cmv_real,
          COUNT(*) FILTER (WHERE cmv_real > 0)::int as vendas_com_custo,
          COUNT(*) FILTER (WHERE cmv_real = 0 AND qtd_itens > 0)::int as vendas_sem_custo_total,
          COUNT(*) FILTER (WHERE cmv_real > 0 AND itens_sem_custo > 0)::int as vendas_com_custo_parcial
        FROM itens_por_venda
        GROUP BY DATE_TRUNC('month', created_at)
        ORDER BY mes
      )
      SELECT *,
        (recebimento - cmv_real - custo_flex) as lucro_real,
        CASE WHEN cmv_real > 0
          THEN ROUND((recebimento - cmv_real - custo_flex) / cmv_real * 100)::numeric
          ELSE 0
        END as margem_pct_real
      FROM resumo_mes
    `, companyId, from)

    // Totais
    const totais = dre.reduce(
      (acc, m) => ({
        vendas_total: acc.vendas_total + m.vendas_total,
        vendas_com_custo: acc.vendas_com_custo + m.vendas_com_custo,
        vendas_sem_custo_total: acc.vendas_sem_custo_total + m.vendas_sem_custo_total,
        vendas_com_custo_parcial: acc.vendas_com_custo_parcial + m.vendas_com_custo_parcial,
        receita_bruta: acc.recebimento + (m.recebimento || 0),
        recebimento: acc.recebimento + (m.recebimento || 0),
        custo_flex: acc.custo_flex + (m.custo_flex || 0),
        cmv_real: acc.cmv_real + (Number(m.cmv_real) || 0),
        lucro_real: acc.lucro_real + (Number(m.lucro_real) || 0),
      }),
      { vendas_total: 0, vendas_com_custo: 0, vendas_sem_custo_total: 0, vendas_com_custo_parcial: 0, receita_bruta: 0, recebimento: 0, custo_flex: 0, cmv_real: 0, lucro_real: 0 }
    )

    return NextResponse.json({
      ok: true,
      company_id: companyId,
      from,
      dre_mensal: dre,
      totais,
      explicacao: 'cmv_real = soma APENAS dos items com custo_unitario > 0. vendas_sem_custo_total = TODOS os items sem custo. vendas_com_custo_parcial = venda com CMV > 0 MAS tem pelo menos 1 item sem custo.',
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}
