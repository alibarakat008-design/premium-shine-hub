import { NextRequest, NextResponse } from 'next/server'
import { isMatrizRequest, getAuthenticatedCompanyId } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/dashboard-parceiro?days=30
 *
 * REVISADO (24/07/2026): antes esta rota confiava em psh_session_company /
 * psh_active_company — cookies simples que o próprio navegador do parceiro
 * pode editar (ex: DevTools), permitindo ver o dashboard de OUTRA empresa
 * trocando o UUID no cookie. Agora usa o company_id do cookie ASSINADO
 * (psh_auth_token, com HMAC), que o cliente não consegue forjar.
 *
 * Retorna KPIs da empresa ATIVA:
 *   - Receita (últimos N dias)
 *   - Total vendas
 *   - Ticket médio
 *   - Top 5 produtos (mais vendidos)
 *   - Vendas por dia (série temporal)
 *   - Status breakdown (confirmado, enviado, entregue, cancelado)
 *   - CMV total
 *   - Margem média
 *   - Comparativo com período anterior
 */
export async function GET(req: NextRequest) {
  // Endpoint público (passa middleware); autorização real é feita aqui.
  const { searchParams } = new URL(req.url)
  const days = Math.min(Number(searchParams.get('days') || 30), 365)

  // Empresa ativa: se for a matriz, respeita um company_id explícito na
  // query (ela pode ver qualquer empresa); se for parceiro, o company_id
  // SEMPRE vem do token assinado — nunca de um cookie/param editável.
  const requestedCompanyId = searchParams.get('company_id')
  const companyId = isMatrizRequest(req)
    ? (requestedCompanyId || getAuthenticatedCompanyId(req))
    : getAuthenticatedCompanyId(req)

  if (!companyId) {
    return NextResponse.json({
      ok: false,
      error: 'Nenhuma empresa selecionada. Faça login em /admin/login-empresa',
    }, { status: 400 })
  }

  try {
    // Valida company
    const companyRes: any[] = await prisma.$queryRawUnsafe(
      `SELECT id, nome_fantasia, razao_social, cnpj, account_type, (access_token_ml IS NOT NULL AND access_token_ml != '__PENDING__') AS has_ml_token, (access_token_ml = '__PENDING__') AS ml_pending FROM companies WHERE id = $1::uuid`,
      companyId,
    )
    if (companyRes.length === 0) {
      return NextResponse.json({ ok: false, error: 'Empresa não encontrada' }, { status: 404 })
    }
    const company = companyRes[0]

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    const sincePrev = new Date(Date.now() - days * 2 * 24 * 60 * 60 * 1000)

    // KPIs principais do período atual
    const kpisRes: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        COUNT(*)::int AS total_vendas,
        COALESCE(SUM(total), 0)::float AS receita_bruta,
        COALESCE(SUM(recebimento_liquido), 0)::float AS receita_liquida,
        COALESCE(SUM(custo_total), 0)::float AS cmv_total,
        COALESCE(AVG(total), 0)::float AS ticket_medio,
        COALESCE(SUM(CASE WHEN status = 'entregue' THEN 1 ELSE 0 END), 0)::int AS total_entregue,
        COALESCE(SUM(CASE WHEN status = 'cancelado' THEN 1 ELSE 0 END), 0)::int AS total_cancelado
      FROM orders
      WHERE company_id = $1::uuid AND created_at >= $2
    `, companyId, since)

    // KPIs do período anterior (pra comparativo)
    const kpisPrevRes: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        COUNT(*)::int AS total_vendas,
        COALESCE(SUM(total), 0)::float AS receita_bruta,
        COALESCE(SUM(recebimento_liquido), 0)::float AS receita_liquida
      FROM orders
      WHERE company_id = $1::uuid AND created_at >= $2 AND created_at < $3
    `, companyId, sincePrev, since)

    // Status breakdown
    const statusRes: any[] = await prisma.$queryRawUnsafe(`
      SELECT status, COUNT(*)::int AS qty
      FROM orders
      WHERE company_id = $1::uuid AND created_at >= $2
      GROUP BY status
    `, companyId, since)

    // Top 5 produtos
    const topProdRes: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        oi.sku,
        oi.nome_produto AS title,
        SUM(oi.quantidade)::int AS qtd,
        COALESCE(SUM(oi.quantidade * oi.preco_unitario), 0)::float AS receita
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.company_id = $1::uuid AND o.created_at >= $2
        AND oi.sku IS NOT NULL
      GROUP BY oi.sku, oi.nome_produto
      ORDER BY qtd DESC
      LIMIT 5
    `, companyId, since)

    // Vendas por dia (série temporal)
    const dailyRes: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        DATE(created_at) AS dia,
        COUNT(*)::int AS vendas,
        COALESCE(SUM(total), 0)::float AS receita
      FROM orders
      WHERE company_id = $1::uuid AND created_at >= $2
      GROUP BY DATE(created_at)
      ORDER BY dia ASC
    `, companyId, since)

    const kpis = kpisRes[0]
    const kpisPrev = kpisPrevRes[0]

    const margem = kpis.receita_bruta > 0
      ? ((kpis.receita_bruta - kpis.cmv_total) / kpis.receita_bruta * 100)
      : 0

    const comparativo = {
      vendas: kpisPrev.total_vendas > 0
        ? Math.round((kpis.total_vendas - kpisPrev.total_vendas) / kpisPrev.total_vendas * 100)
        : 0,
      receita: kpisPrev.receita_bruta > 0
        ? Math.round((kpis.receita_bruta - kpisPrev.receita_bruta) / kpisPrev.receita_bruta * 100)
        : 0,
    }

    return NextResponse.json({
      ok: true,
      company,
      period_days: days,
      since: since.toISOString(),
      kpis: {
        total_vendas: kpis.total_vendas,
        receita_bruta: kpis.receita_bruta,
        receita_liquida: kpis.receita_liquida,
        cmv_total: kpis.cmv_total,
        ticket_medio: kpis.ticket_medio,
        total_entregue: kpis.total_entregue,
        total_cancelado: kpis.total_cancelado,
        margem_pct: Math.round(margem * 100) / 100,
      },
      comparativo,
      status_breakdown: statusRes,
      top_produtos: topProdRes,
      vendas_por_dia: dailyRes,
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}