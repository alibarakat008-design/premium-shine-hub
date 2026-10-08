/**
 * API: Vendas Recentes Filtrado
 *
 * Aceita filtro por:
 *  - origem: 'mercado_livre' | 'shopee' | 'manual' | 'b2b' | etc
 *  - company_id: filtrar empresa
 *  - data_contabil: 'hoje' | 'ontem' | 'personalizado' (yyyy-mm-dd)
 *  - dias: numero de dias
 *
 * Retorna:
 *  - vendas: lista
 *  - resumo: agregado por origem e por company
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const origem = searchParams.get('origem') || null
    const companyId = searchParams.get('company_id') || null
    const dataContabil = searchParams.get('data_contabil') || null
    const days = Math.max(1, Number(searchParams.get('days') || 1))
    const limit = Math.min(Number(searchParams.get('limit') || 100), 500)

    let where: string[] = []
    where.push(`o.status NOT IN ('cancelado', 'devolvido')`)

    if (dataContabil === 'hoje') {
      where.push(`o.data_contabil = CURRENT_DATE`)
    } else if (dataContabil === 'ontem') {
      where.push(`o.data_contabil = CURRENT_DATE - 1`)
    } else {
      where.push(`o.created_at > NOW() - (INTERVAL '${days} days')`)
    }

    if (origem) {
      where.push(`o.origem = '${origem}'`)
    }
    if (companyId) {
      where.push(`o.company_id = '${companyId}'::uuid`)
    }

    const whereClause = 'WHERE ' + where.join(' AND ')

    // 1) Lista de vendas
    const vendas: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        o.id::text,
        o.order_number,
        o.company_id::text,
        c.nome_fantasia as company_nome,
        c.account_type,
        o.origem,
        o.total::text,
        o.custo_total::text,
        o.comissao_seller_valor::text as comissao,
        o.frete::text,
        o.custo_flex::text,
        o.tipo_envio,
        o.status,
        o.created_at,
        o.etiqueta_impressa_em,
        o.impressa_por_company_id::text as impressa_por,
        ic.nome_fantasia as impressa_por_nome,
        o.data_contabil::text as data_contabil
      FROM orders o
      LEFT JOIN companies c ON c.id = o.company_id
      LEFT JOIN companies ic ON ic.id = o.impressa_por_company_id
      ${whereClause}
      ORDER BY o.created_at DESC
      LIMIT ${limit}
    `)

    // 2) Resumo por origem
    const resumoOrigem: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        o.origem,
        COUNT(*)::int as vendas,
        ROUND(COALESCE(SUM(o.total::numeric), 0)::numeric, 2)::text as receita,
        ROUND(COALESCE(SUM(o.custo_total::numeric), 0)::numeric, 2)::text as cmv,
        ROUND(COALESCE(SUM(o.comissao_seller_valor::numeric), 0)::numeric, 2)::text as comissao,
        ROUND(COALESCE(SUM(o.frete::numeric), 0)::numeric, 2)::text as frete,
        ROUND(COALESCE(SUM(o.custo_flex::numeric), 0)::numeric, 2)::text as custo_flex
      FROM orders o
      ${whereClause}
      GROUP BY o.origem
      ORDER BY receita DESC
    `)

    // 3) Resumo por company
    const resumoCompany: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        o.company_id::text,
        c.nome_fantasia as nome,
        c.account_type,
        COUNT(*)::int as vendas,
        ROUND(COALESCE(SUM(o.total::numeric), 0)::numeric, 2)::text as receita,
        ROUND(COALESCE(SUM(o.custo_total::numeric), 0)::numeric, 2)::text as cmv
      FROM orders o
      LEFT JOIN companies c ON c.id = o.company_id
      ${whereClause}
      GROUP BY o.company_id, c.nome_fantasia, c.account_type
      ORDER BY receita DESC
    `)

    // 4) Total
    const totalRow: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        COUNT(*)::int as vendas,
        ROUND(COALESCE(SUM(o.total::numeric), 0)::numeric, 2)::text as receita,
        ROUND(COALESCE(SUM(o.custo_total::numeric), 0)::numeric, 2)::text as cmv,
        ROUND(COALESCE(SUM(o.comissao_seller_valor::numeric), 0)::numeric, 2)::text as comissao,
        ROUND(COALESCE(SUM(o.frete::numeric), 0)::numeric, 2)::text as frete,
        ROUND(COALESCE(SUM(o.custo_flex::numeric), 0)::numeric, 2)::text as custo_flex
      FROM orders o
      ${whereClause}
    `)
    const t = totalRow[0] || {}

    return NextResponse.json({
      ok: true,
      vendas,
      resumo_por_origem: resumoOrigem,
      resumo_por_company: resumoCompany,
      totais: {
        vendas: Number(t.vendas || 0),
        receita: Number(t.receita || 0),
        cmv: Number(t.cmv || 0),
        comissao: Number(t.comissao || 0),
        frete: Number(t.frete || 0),
        custo_flex: Number(t.custo_flex || 0),
      },
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
