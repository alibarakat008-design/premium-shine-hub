/**
 * GET /api/admin/debug-parceiro?company_id=X
 *
 * Debug: mostra o estado da empresa + suas orders + produtos
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const companyId = searchParams.get('company_id')
  if (!companyId) {
    return NextResponse.json({ ok: false, error: 'company_id obrigatório' }, { status: 400 })
  }

  try {
    // 1) Info da empresa
    const company: any[] = await prisma.$queryRawUnsafe(
      `SELECT id::text, nome_fantasia, cnpj, account_type,
              ml_user_id::text AS ml_user_id,
              ml_expires_at,
              CASE WHEN access_token_ml IS NOT NULL THEN true ELSE false END AS has_token
       FROM companies WHERE id = $1::uuid`,
      companyId,
    )
    if (company.length === 0) {
      return NextResponse.json({ ok: false, error: 'Empresa não encontrada' }, { status: 404 })
    }

    // 2) marketplace_accounts vinculada
    const accounts = await prisma.marketplace_accounts.findMany({
      where: { company_id: companyId },
      select: { id: true, account_id: true, nickname: true, ativa: true, access_token: true },
    })

    // 3) Total de orders
    const ordersCount: any[] = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS total FROM orders WHERE company_id = $1::uuid`,
      companyId,
    )

    // 4) Últimas 5 orders
    const lastOrders: any[] = await prisma.$queryRawUnsafe(
      `SELECT order_number, total, status, created_at, company_id::text
       FROM orders WHERE company_id = $1::uuid
       ORDER BY created_at DESC LIMIT 5`,
      companyId,
    )

    // 5) Products únicos nas orders
    const productsInOrders: any[] = await prisma.$queryRawUnsafe(`
      SELECT COUNT(DISTINCT oi.product_id)::int AS total
      FROM order_items oi
      INNER JOIN orders o ON o.id = oi.order_id
      WHERE o.company_id = $1::uuid
    `, companyId)

    // 6) product_prices count
    const pricesCount: any[] = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS total FROM product_prices WHERE company_id = $1::uuid`,
      companyId,
    )

    // 7) Sample dos produtos (5 primeiros)
    const sampleProducts: any[] = await prisma.$queryRawUnsafe(`
      SELECT DISTINCT p.sku, p.nome
      FROM products p
      INNER JOIN order_items oi ON oi.product_id = p.id
      INNER JOIN orders o ON o.id = oi.order_id
      WHERE o.company_id = $1::uuid
      LIMIT 5
    `, companyId)

    return NextResponse.json({
      ok: true,
      company: company[0],
      marketplace_accounts: accounts.map(a => ({
        id: a.id,
        account_id: a.account_id,
        nickname: a.nickname,
        ativa: a.ativa,
        has_access_token: !!a.access_token,
      })),
      orders: {
        total: ordersCount[0]?.total || 0,
        ultimas_5: lastOrders,
      },
      produtos_unicos_nas_vendas: productsInOrders[0]?.total || 0,
      product_prices_cadastrados: pricesCount[0]?.total || 0,
      sample_produtos: sampleProducts,
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}