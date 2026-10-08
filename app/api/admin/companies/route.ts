import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  // Auth Basic
  const auth = req.headers.get('authorization')
  if (auth !== `Basic ${Buffer.from('premium:shine2026').toString('base64')}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // PRIVACIDADE: Parceiro/filial só pode ver a PRÓPRIA empresa na listagem
    // Matriz (ou sem sessão) vê todas
    const sessionRole = req.cookies.get('psh_session_role')?.value
    const sessionCompanyId = req.cookies.get('psh_session_company')?.value
    const isMatriz = !sessionRole || sessionRole === 'matriz'

    // Lista companies com métricas agregadas
    // Se não-matriz, WHERE filtra SÓ a session_company dele
    const filterClause = isMatriz
      ? ''
      : `WHERE c.id = '${sessionCompanyId}'::uuid`

    const companies: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        c.id,
        c.cnpj,
        c.nome_fantasia,
        c.razao_social,
        c.account_type,
        c.ativa,
        c.email,
        c.created_at,
        -- Métricas últimos 30 dias
        COALESCE((SELECT COUNT(*)::int FROM orders o WHERE o.company_id = c.id AND o.created_at >= NOW() - INTERVAL '30 days'), 0) AS vendas_30d,
        COALESCE((SELECT SUM(total)::float FROM orders o WHERE o.company_id = c.id AND o.created_at >= NOW() - INTERVAL '30 days'), 0) AS receita_30d,
        COALESCE((SELECT COUNT(*)::int FROM orders o WHERE o.company_id = c.id), 0) AS total_orders,
        COALESCE((SELECT COUNT(DISTINCT pp.product_id)::int FROM product_prices pp WHERE pp.company_id = c.id), 0) AS total_products,
        COALESCE((SELECT COUNT(*)::int FROM marketplace_accounts ma WHERE ma.company_id = c.id), 0) AS total_ml_accounts
      FROM companies c
      ${filterClause}
      ORDER BY
        CASE c.account_type WHEN 'matriz' THEN 0 WHEN 'filial' THEN 1 WHEN 'parceiro' THEN 2 WHEN 'cliente' THEN 3 ELSE 4 END,
        c.nome_fantasia
    `)

    // Company ativa do cookie
    const activeCompanyId = req.cookies.get('psh_active_company')?.value || null
    const activeCompany = activeCompanyId
      ? companies.find((c: any) => c.id === activeCompanyId)
      : null

    return NextResponse.json({
      ok: true,
      companies,
      active_company_id: activeCompanyId,
      active_company: activeCompany,
      total: companies.length,
      // Info adicional pro frontend saber se o user pode trocar
      is_matriz: isMatriz,
      session_role: sessionRole || null,
      session_company_id: sessionCompanyId || null,
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}