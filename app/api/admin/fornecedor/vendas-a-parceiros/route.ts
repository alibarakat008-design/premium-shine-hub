/**
 * API: vendas a parceiros (LIURA vê o que cada parceiro pegou)
 *
 * IMPORTANTE: usa `impressa_por_company_id` (quem pegou a etiqueta)
 * como proxy de "comprou de mim".
 *
 * GET /api/admin/fornecedor/vendas-a-parceiros?days=30&seller_company_id=LIURA
 *
 * Retorna:
 *  - resumo_por_parceiro: total de vendas + etiquetas impressas por parceiro
 *  - etiquetas_impressas_hoje: lista detalhada (HOJE, BRT)
 *  - analise_corte_14h: vendas antes/depois 14h
 *  - data_contabil: vendas agrupadas pela data contábil (corte 14h)
 *  - parceiros_cadastrados: lista
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const days = Math.max(1, Number(searchParams.get('days') || 30))
    const sellerCompanyId = searchParams.get('seller_company_id') || null

    // 1) Lista parceiros
    let allCompanies: any[] = []
    if (sellerCompanyId) {
      allCompanies = await prisma.$queryRawUnsafe(`
        SELECT id::text, nome_fantasia, cnpj, account_type
        FROM companies
        WHERE id != '${sellerCompanyId}'::uuid
          AND account_type IN ('parceiro', 'filial')
        ORDER BY nome_fantasia
      `)
    }

    // 2) Resumo por parceiro (usando impressa_por_company_id)
    const resumo: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        COALESCE(o.impressa_por_company_id, o.company_id)::text as company_id,
        c.nome_fantasia as parceiro_nome,
        c.account_type,
        COUNT(*)::int as vendas,
        COUNT(*) FILTER (WHERE o.etiqueta_impressa_em IS NOT NULL)::int as etiquetas_impressas,
        ROUND(COALESCE(SUM(o.total::numeric), 0)::numeric, 2)::text as receita_total,
        ROUND(COALESCE(SUM(o.custo_total::numeric), 0)::numeric, 2)::text as cmv_total
      FROM orders o
      LEFT JOIN companies c ON c.id = COALESCE(o.impressa_por_company_id, o.company_id)
      WHERE o.origem = 'mercado_livre'
        AND o.status NOT IN ('cancelado', 'devolvido')
        AND o.created_at > NOW() - (INTERVAL '${days} days')
        ${sellerCompanyId ? `AND (o.company_id = '${sellerCompanyId}'::uuid OR o.impressa_por_company_id = '${sellerCompanyId}'::uuid OR o.impressa_por_company_id IS NOT NULL)` : ''}
      GROUP BY COALESCE(o.impressa_por_company_id, o.company_id), c.nome_fantasia, c.account_type
      ORDER BY receita_total DESC
    `)

    // 3) Etiquetas impressas HOJE (com parceiro)
    const hoje: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        o.id::text as venda_id,
        o.order_number,
        COALESCE(o.impressa_por_company_id::text, o.company_id::text) as company_id,
        c.nome_fantasia as parceiro_nome,
        o.total::text,
        o.custo_total::text,
        o.etiqueta_impressa_em,
        o.created_at,
        o.tipo_envio
      FROM orders o
      LEFT JOIN companies c ON c.id = COALESCE(o.impressa_por_company_id, o.company_id)
      WHERE o.origem = 'mercado_livre'
        AND o.status NOT IN ('cancelado', 'devolvido')
        AND o.etiqueta_impressa_em IS NOT NULL
        AND DATE(o.etiqueta_impressa_em AT TIME ZONE 'America/Sao_Paulo') = CURRENT_DATE
        ${sellerCompanyId ? `AND (o.company_id = '${sellerCompanyId}'::uuid OR o.impressa_por_company_id = '${sellerCompanyId}'::uuid)` : ''}
      ORDER BY o.etiqueta_impressa_em DESC
      LIMIT 200
    `)

    // 4) Análise do corte 14h (data_contabil)
    const dataContabil: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        data_contabil::text as data,
        COUNT(*)::int as vendas,
        ROUND(COALESCE(SUM(total::numeric), 0)::numeric, 2)::text as receita,
        COUNT(*) FILTER (WHERE EXTRACT(HOUR FROM created_at AT TIME ZONE 'America/Sao_Paulo') < 14)::int as vendas_ate_14h,
        COUNT(*) FILTER (WHERE EXTRACT(HOUR FROM created_at AT TIME ZONE 'America/Sao_Paulo') >= 14)::int as vendas_pos_14h
      FROM orders
      WHERE origem = 'mercado_livre'
        AND status NOT IN ('cancelado', 'devolvido')
        AND data_contabil IS NOT NULL
        AND data_contabil > CURRENT_DATE - INTERVAL '${days} days'
        ${sellerCompanyId ? `AND company_id = '${sellerCompanyId}'::uuid` : ''}
      GROUP BY data_contabil
      ORDER BY data_contabil DESC
    `)

    return NextResponse.json({
      ok: true,
      periodo_dias: days,
      resumo_por_parceiro: resumo,
      etiquetas_impressas_hoje: hoje,
      data_contabil: dataContabil,
      parceiros_cadastrados: allCompanies,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
