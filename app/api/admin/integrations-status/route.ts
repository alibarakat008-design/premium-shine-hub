import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * GET /api/admin/integrations-status?company_id=X
 *
 * Retorna status de todas as integrações (ML, Shopee, etc) de uma empresa:
 * - ativa (token presente + não expirado)
 * - user_id / shop_id
 * - token_expires_at
 * - total_orders (vendas já sincronizadas no DB)
 *
 * Usado pela página /admin/integracoes
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const companyId = searchParams.get('company_id')
    if (!companyId) return NextResponse.json({ ok: false, error: 'company_id obrigatório' }, { status: 400 })

    // 1) Empresa
    const company: any[] = await prisma.$queryRawUnsafe(
      `SELECT id, nome_fantasia, cnpj FROM companies WHERE id = $1::uuid`,
      companyId,
    )
    if (!company[0]) return NextResponse.json({ ok: false, error: 'Empresa não encontrada' }, { status: 404 })

    // 2) Status Mercado Livre
    const ml: any[] = await prisma.$queryRawUnsafe(
      `SELECT access_token_ml, refresh_token_ml, ml_expires_at, ml_user_id
       FROM companies WHERE id = $1::uuid`,
      companyId,
    )
    const mlRow = ml[0] || {}
    const mlActive = !!mlRow.access_token_ml && (!mlRow.ml_expires_at || new Date(mlRow.ml_expires_at).getTime() > Date.now())

    // 3) Status Shopee
    const sh: any[] = await prisma.$queryRawUnsafe(
      `SELECT shopee_access_token, shopee_refresh_token, shopee_expires_at, shopee_shop_id
       FROM companies WHERE id = $1::uuid`,
      companyId,
    )
    const shRow = sh[0] || {}
    const shActive = !!shRow.shopee_access_token && (!shRow.shopee_expires_at || new Date(shRow.shopee_expires_at).getTime() > Date.now())

    // 4) Contagem de vendas por plataforma
    const counts: any[] = await prisma.$queryRawUnsafe(
      `SELECT origem, COUNT(*)::int as total, MAX(created_at)::text as last_sync
       FROM orders
       WHERE company_id = $1::uuid
       GROUP BY origem`,
      companyId,
    )
    const mlCount = counts.find(c => c.origem === 'mercado_livre') || { total: 0, last_sync: null }
    const shCount = counts.find(c => c.origem === 'shopee') || { total: 0, last_sync: null }

    return NextResponse.json({
      ok: true,
      company: {
        id: company[0].id,
        nome_fantasia: company[0].nome_fantasia,
        cnpj: company[0].cnpj,
      },
      integrations: [
        {
          plataforma: 'mercado_livre',
          label: 'Mercado Livre',
          emoji: '🛒',
          cor: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
          ativa: mlActive,
          user_id: mlRow.ml_user_id || null,
          expires_at: mlRow.ml_expires_at || null,
          total_orders: mlCount.total,
          last_sync: mlCount.last_sync,
        },
        {
          plataforma: 'shopee',
          label: 'Shopee',
          emoji: '🛍️',
          cor: 'linear-gradient(135deg, #f97316, #ea580c)',
          ativa: shActive,
          user_id: shRow.shopee_shop_id || null,
          expires_at: shRow.shopee_expires_at || null,
          total_orders: shCount.total,
          last_sync: shCount.last_sync,
        },
      ],
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}
