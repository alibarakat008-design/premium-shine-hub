/**
 * DRE Filtrado - permite ver o DRE agrupado por:
 *  - marketplace (mercado_livre, shopee, manual, b2b, etc)
 *  - vendedor (company_id - cada empresa/parceiro)
 *  - tudo junto
 *
 * Recebe parametros:
 *  - days: periodo (default 30)
 *  - group_by: 'origem' | 'company' | 'all'
 *  - company_id: filtrar empresa especifica (opcional, para parceiro ver só dele)
 *  - origens: filtrar origens (opcional)
 *
 * Retorna:
 *  - linhas: array com DRE detalhado por agrupamento
 *  - totais: DRE consolidado
 *  - comparativo: vs periodo anterior
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const days = Math.max(1, Number(searchParams.get('days') || 30))
    const groupBy = searchParams.get('group_by') || 'all'  // 'origem' | 'company' | 'all'
    const companyId = searchParams.get('company_id') || null
    const origensParam = searchParams.get('origens') || null
    const origens = origensParam ? origensParam.split(',').map(s => s.trim()) : null

    // Condicoes WHERE
    let whereConditions: string[] = []
    whereConditions.push(`o.created_at > NOW() - (INTERVAL '${days} days')`)
    whereConditions.push(`o.status NOT IN ('cancelado', 'devolvido')`)

    if (companyId) {
      whereConditions.push(`o.company_id = '${companyId}'::uuid`)
    }
    if (origens && origens.length > 0) {
      const origensSql = origens.map(o => `'${o}'`).join(',')
      whereConditions.push(`o.origem IN (${origensSql})`)
    }
    const whereClause = 'WHERE ' + whereConditions.join(' AND ')

    // 1) GROUP BY origem (marketplace)
    let linhas: any[] = []
    if (groupBy === 'origem' || groupBy === 'all') {
      const rows: any[] = await prisma.$queryRawUnsafe(`
        SELECT
          o.origem,
          COUNT(*)::int as vendas,
          ROUND(COALESCE(SUM(o.total::numeric), 0)::numeric, 2)::text as receita,
          ROUND(COALESCE(SUM(o.custo_total::numeric), 0)::numeric, 2)::text as cmv,
          ROUND(COALESCE(SUM(COALESCE(o.tarifa_pct_valor, 0) + COALESCE(o.tarifa_fixa_valor, 0))::numeric, 0)::numeric, 2)::text as comissao,
          ROUND(COALESCE(SUM(o.recebimento_liquido::numeric), 0)::numeric, 2)::text as recebimento,
          ROUND(COALESCE(SUM(o.frete::numeric), 0)::numeric, 2)::text as frete,
          ROUND(COALESCE(SUM(o.custo_flex::numeric), 0)::numeric, 2)::text as custo_flex,
          ROUND(COALESCE(SUM(o.recebimento_liquido::numeric) - COALESCE(SUM(o.custo_total::numeric), 0) - COALESCE(SUM(o.custo_flex::numeric), 0), 0)::numeric, 2)::text as lucro
        FROM orders o
        ${whereClause}
        GROUP BY o.origem
        ORDER BY receita DESC
      `)
      for (const r of rows) {
        const receita = Number(r.receita)
        const cmv = Number(r.cmv)
        const comissao = Number(r.comissao)
        const recebimento = Number(r.recebimento)
        const frete = Number(r.frete)
        const custoFlex = Number(r.custo_flex)
        // FÓRMULA CANÔNICA: recebimento - CMV - custo_flex
        const lucro = recebimento - cmv - custoFlex
        linhas.push({
          chave: r.origem,
          tipo: 'origem',
          label: r.origem,
          vendas: r.vendas,
          receita: receita,
          cmv: cmv,
          cmv_pct: receita > 0 ? cmv / receita * 100 : 0,
          comissao: comissao,
          recebimento: recebimento,
          frete: frete,
          custo_flex: custoFlex,
          lucro: lucro,
          margem_pct: receita > 0 ? lucro / receita * 100 : 0,
          margem_pct_recebimento: recebimento > 0 ? lucro / recebimento * 100 : 0,
        })
      }
    }

    // 2) GROUP BY company (vendedor)
    if (groupBy === 'company' || groupBy === 'all') {
      const rows: any[] = await prisma.$queryRawUnsafe(`
        SELECT
          o.company_id::text,
          c.nome_fantasia,
          c.account_type,
          COUNT(*)::int as vendas,
          ROUND(COALESCE(SUM(o.total::numeric), 0)::numeric, 2)::text as receita,
          ROUND(COALESCE(SUM(o.custo_total::numeric), 0)::numeric, 2)::text as cmv,
          ROUND(COALESCE(SUM(COALESCE(o.tarifa_pct_valor, 0) + COALESCE(o.tarifa_fixa_valor, 0))::numeric, 0)::numeric, 2)::text as comissao,
          ROUND(COALESCE(SUM(o.recebimento_liquido::numeric), 0)::numeric, 2)::text as recebimento,
          ROUND(COALESCE(SUM(o.frete::numeric), 0)::numeric, 2)::text as frete,
          ROUND(COALESCE(SUM(o.custo_flex::numeric), 0)::numeric, 2)::text as custo_flex
        FROM orders o
        LEFT JOIN companies c ON c.id = o.company_id
        ${whereClause}
        GROUP BY o.company_id, c.nome_fantasia, c.account_type
        ORDER BY receita DESC
      `)
      for (const r of rows) {
        const receita = Number(r.receita)
        const cmv = Number(r.cmv)
        const comissao = Number(r.comissao)
        const recebimento = Number(r.recebimento)
        const frete = Number(r.frete)
        const custoFlex = Number(r.custo_flex)
        // FÓRMULA CANÔNICA: recebimento - CMV - custo_flex
        const lucro = recebimento - cmv - custoFlex
        linhas.push({
          chave: r.company_id,
          tipo: 'company',
          label: r.nome_fantasia || '(sem nome)',
          account_type: r.account_type,
          vendas: r.vendas,
          receita: receita,
          cmv: cmv,
          cmv_pct: receita > 0 ? cmv / receita * 100 : 0,
          comissao,
          recebimento,
          frete,
          custo_flex: custoFlex,
          lucro,
          margem_pct: receita > 0 ? lucro / receita * 100 : 0,
          margem_pct_recebimento: recebimento > 0 ? lucro / recebimento * 100 : 0,
        })
      }
    }

    // 3) TOTAL consolidado
    // FÓRMULA CANÔNICA: lucro = recebimento - CMV - custo_flex
    // (recebimento_liquido já desconta comissão + frete + cupom e soma bônus envio)
    const totalRow: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        COUNT(*)::int as vendas,
        ROUND(COALESCE(SUM(o.total::numeric), 0)::numeric, 2)::text as receita,
        ROUND(COALESCE(SUM(o.custo_total::numeric), 0)::numeric, 2)::text as cmv,
        ROUND(COALESCE(SUM(COALESCE(o.tarifa_pct_valor, 0) + COALESCE(o.tarifa_fixa_valor, 0))::numeric, 0)::numeric, 2)::text as comissao,
        ROUND(COALESCE(SUM(o.tarifa_pct_valor::numeric), 0)::numeric, 2)::text as tarifa_pct,
        ROUND(COALESCE(SUM(o.tarifa_fixa_valor::numeric), 0)::numeric, 2)::text as tarifa_fixa,
        ROUND(COALESCE(SUM(o.bonus_envio_valor::numeric), 0)::numeric, 2)::text as bonus_envio,
        ROUND(COALESCE(SUM(o.bonus_cupom_valor::numeric), 0)::numeric, 2)::text as bonus_cupom,
        ROUND(COALESCE(SUM(o.frete::numeric), 0)::numeric, 2)::text as frete,
        ROUND(COALESCE(SUM(o.recebimento_liquido::numeric), 0)::numeric, 2)::text as recebimento,
        ROUND(COALESCE(SUM(o.custo_flex::numeric), 0)::numeric, 2)::text as custo_flex
      FROM orders o
      ${whereClause}
    `)
    const t = totalRow[0] || {}
    const receitaTotal = Number(t.receita)
    const cmvTotal = Number(t.cmv)
    const comissaoTotal = Number(t.comissao)
    const tarifaPctTotal = Number(t.tarifa_pct)
    const tarifaFixaTotal = Number(t.tarifa_fixa)
    const bonusEnvioTotal = Number(t.bonus_envio)
    const bonusCupomTotal = Number(t.bonus_cupom)
    const freteTotal = Number(t.frete)
    const recebimentoTotal = Number(t.recebimento)
    const custoFlexTotal = Number(t.custo_flex)
    // Lucro canônico: recebimento - CMV - custo_flex
    const lucroTotal = recebimentoTotal - cmvTotal - custoFlexTotal

    // 4) Comparativo vs periodo anterior
    const prevRow: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        COUNT(*)::int as vendas,
        ROUND(COALESCE(SUM(o.total::numeric), 0)::numeric, 2)::text as receita,
        ROUND(COALESCE(SUM(o.custo_total::numeric), 0)::numeric, 2)::text as cmv
      FROM orders o
      WHERE o.created_at BETWEEN NOW() - (INTERVAL '${days * 2} days') AND NOW() - (INTERVAL '${days} days')
        AND o.status NOT IN ('cancelado', 'devolvido')
        ${companyId ? `AND o.company_id = '${companyId}'::uuid` : ''}
        ${origens && origens.length > 0 ? `AND o.origem IN (${origens.map(o => `'${o}'`).join(',')})` : ''}
    `)
    const p = prevRow[0] || {}
    const receitaPrev = Number(p.receita)
    const variacaoReceita = receitaPrev > 0 ? (receitaTotal - receitaPrev) / receitaPrev * 100 : 0

    return NextResponse.json({
      ok: true,
      periodo_dias: days,
      group_by: groupBy,
      linhas,
      totais: {
        vendas: t.vendas || 0,
        receita: receitaTotal,
        cmv: cmvTotal,
        cmv_pct: receitaTotal > 0 ? cmvTotal / receitaTotal * 100 : 0,
        comissao: comissaoTotal,
        tarifa_pct: tarifaPctTotal,
        tarifa_fixa: tarifaFixaTotal,
        bonus_envio: bonusEnvioTotal,
        bonus_cupom: bonusCupomTotal,
        frete: freteTotal,
        custo_flex: custoFlexTotal,
        recebimento: recebimentoTotal,
        lucro: lucroTotal,
        margem_pct: receitaTotal > 0 ? lucroTotal / receitaTotal * 100 : 0,
        margem_pct_recebimento: recebimentoTotal > 0 ? lucroTotal / recebimentoTotal * 100 : 0,
      },
      comparativo: {
        periodo_anterior: {
          vendas: p.vendas || 0,
          receita: receitaPrev,
        },
        variacao_receita_pct: variacaoReceita,
      },
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
