/**
 * API: Financeiro Completo LIURA
 *
 * Consolida TODAS as fontes de receita/despesa:
 *  1. Vendas B2C (cliente final via ML) - receita ML - CMV - comissão - frete - FLEX
 *  2. Vendas B2B (parceiro compra de mim) - inter_company_sales.total
 *  3. CMV das vendas B2B = custo que LIURA pagou pra ter esses produtos (custo_fornecedor)
 *  4. Compras que LIURA fez (de outros fornecedores) - company_purchases.total
 *
 * Lucro real LIURA = (lucro B2C) + (lucro B2B)
 *
 * GET /api/admin/fornecedor/financeiro-completo?days=30&company_id=LIURA
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const days = Math.max(1, Number(searchParams.get('days') || 30))
    const companyId = searchParams.get('company_id') || 'e2633570-74da-4b14-9ca1-ba7b0670e612' // LIURA default

    // 1) VENDAS B2C (orders onde company_id = LIURA)
    const b2c: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        COUNT(*)::int as vendas,
        ROUND(COALESCE(SUM(total::numeric), 0)::numeric, 2)::text as receita,
        ROUND(COALESCE(SUM(custo_total::numeric), 0)::numeric, 2)::text as cmv,
        ROUND(COALESCE(SUM(comissao_seller_valor::numeric), 0)::numeric, 2)::text as comissao,
        ROUND(COALESCE(SUM(frete::numeric), 0)::numeric, 2)::text as frete,
        ROUND(COALESCE(SUM(custo_flex::numeric), 0)::numeric, 2)::text as custo_flex
      FROM orders
      WHERE company_id = '${companyId}'::uuid
        AND origem = 'mercado_livre'
        AND status NOT IN ('cancelado', 'devolvido')
        AND created_at > NOW() - (INTERVAL '${days} days')
    `)

    // 2) VENDAS B2B (inter_company_sales onde seller = LIURA)
    const b2b: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        COUNT(*)::int as vendas,
        ROUND(COALESCE(SUM(total::numeric), 0)::numeric, 2)::text as receita_b2b,
        ROUND(COALESCE(SUM(custo_vendedor::numeric), 0)::numeric, 2)::text as custo_vendedor
      FROM inter_company_sales
      WHERE seller_company_id = '${companyId}'::uuid
        AND data_venda > NOW() - (INTERVAL '${days} days')
    `)

    // 3) Vendas B2B agrupadas por comprador
    const b2bPorParceiro: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        buyer_company_id::text as company_id,
        c.nome_fantasia as parceiro,
        COUNT(*)::int as vendas,
        ROUND(COALESCE(SUM(ics.total::numeric), 0)::numeric, 2)::text as receita_b2b,
        ROUND(COALESCE(SUM(ics.custo_vendedor::numeric), 0)::numeric, 2)::text as custo_vendedor,
        ROUND(COALESCE(SUM(ics.total::numeric) - COALESCE(SUM(ics.custo_vendedor::numeric), 0), 0)::numeric, 2)::text as lucro_b2b
      FROM inter_company_sales ics
      LEFT JOIN companies c ON c.id = ics.buyer_company_id
      WHERE ics.seller_company_id = '${companyId}'::uuid
        AND ics.data_venda > NOW() - (INTERVAL '${days} days')
      GROUP BY buyer_company_id, c.nome_fantasia
      ORDER BY receita_b2b DESC
    `)

    // 4) Compras que LIURA fez de OUTROS fornecedores (custo de aquisição)
    const compras: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        COUNT(*)::int as compras,
        ROUND(COALESCE(SUM(cp.total::numeric), 0)::numeric, 2)::text as total_gasto
      FROM company_purchases cp
      WHERE cp.company_id = '${companyId}'::uuid
        AND cp.fornecedor_company_id IS NOT NULL
        AND cp.fornecedor_company_id != '${companyId}'::uuid
        AND cp.data_compra > NOW() - (INTERVAL '${days} days')
    `)

    // 5) Detalhe B2B: company_purchases (parceiro comprou de mim)
    const comprasDeMim: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        cp.id::text,
        cp.company_id::text as buyer_company_id,
        c.nome_fantasia as parceiro,
        cp.data_compra,
        cp.numero_pedido,
        cp.total::text,
        cp.status,
        COUNT(cpi.id)::int as qtd_items
      FROM company_purchases cp
      LEFT JOIN companies c ON c.id = cp.company_id
      LEFT JOIN company_purchase_items cpi ON cpi.purchase_id = cp.id
      WHERE cp.fornecedor_company_id = '${companyId}'::uuid
        AND cp.data_compra > NOW() - (INTERVAL '${days} days')
      GROUP BY cp.id, c.nome_fantasia
      ORDER BY cp.data_compra DESC
      LIMIT 100
    `)

    // 6) Cálculo do lucro real
    const receitaB2C = Number(b2c[0]?.receita || 0)
    const cmvB2C = Number(b2c[0]?.cmv || 0)
    const comissaoB2C = Number(b2c[0]?.comissao || 0)
    const freteB2C = Number(b2c[0]?.frete || 0)
    const custoFlexB2C = Number(b2c[0]?.custo_flex || 0)
    const lucroB2C = receitaB2C - cmvB2C - comissaoB2C - freteB2C - custoFlexB2C

    const receitaB2B = Number(b2b[0]?.receita_b2b || 0)
    const custoB2B = Number(b2b[0]?.custo_vendedor || 0)
    const lucroB2B = receitaB2B - custoB2B

    const lucroTotalLIURA = lucroB2C + lucroB2B
    const margemTotal = receitaB2C + receitaB2B > 0 ? (lucroTotalLIURA / (receitaB2C + receitaB2B)) * 100 : 0

    return NextResponse.json({
      ok: true,
      periodo_dias: days,
      // Vendas B2C (cliente final)
      b2c: {
        vendas: b2c[0]?.vendas || 0,
        receita: receitaB2C,
        cmv: cmvB2C,
        cmv_pct: receitaB2C > 0 ? (cmvB2C / receitaB2C * 100) : 0,
        comissao: comissaoB2C,
        frete: freteB2C,
        custo_flex: custoFlexB2C,
        lucro: lucroB2C,
        margem_pct: receitaB2C > 0 ? (lucroB2C / receitaB2C * 100) : 0,
      },
      // Vendas B2B (parceiro compra)
      b2b: {
        vendas: b2b[0]?.vendas || 0,
        receita: receitaB2B,
        custo_vendedor: custoB2B,
        lucro: lucroB2B,
        margem_pct: receitaB2B > 0 ? (lucroB2B / receitaB2B * 100) : 0,
      },
      // Compras que LIURA fez de outros (custo aquisição)
      compras: {
        total: compras[0]?.compras || 0,
        total_gasto: Number(compras[0]?.total_gasto || 0),
      },
      // Lucro total
      lucro_total: lucroTotalLIURA,
      margem_total_pct: margemTotal,
      // Detalhes
      b2b_por_parceiro: b2bPorParceiro,
      compras_de_mim: comprasDeMim,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
