// Testa o token da empresa REAL (via companies.access_token_ml, não via marketplace_accounts)
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getMLToken } from '@/lib/ml-auth-multi'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || ''
    if (!authHeader.startsWith('Basic ')) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const companyId = searchParams.get('company_id')
    if (!companyId) {
      return NextResponse.json({ ok: false, error: 'company_id obrigatório' }, { status: 400 })
    }

    // 1) Pega info da empresa
    const companyRes: any = await prisma.$queryRawUnsafe(
      `SELECT id, nome_fantasia, access_token_ml IS NOT NULL as has_token, refresh_token_ml IS NOT NULL as has_refresh, ml_user_id::text as ml_uid, ml_expires_at FROM companies WHERE id = $1::uuid`,
      companyId,
    )
    if (companyRes.length === 0) return NextResponse.json({ ok: false, error: 'Empresa não encontrada' }, { status: 404 })
    const company = companyRes[0]

    // 2) Pega o token da empresa específica
    const tokenRes = await getMLToken(companyId)
    const token = tokenRes?.token
    if (!token) {
      return NextResponse.json({
        ok: false,
        company,
        token_source: 'NONE',
        message: 'Sem token pra essa empresa',
      })
    }

    // 3) Testa /users/me
    const meRes = await fetch('https://api.mercadolibre.com/users/me', {
      headers: { Authorization: `Bearer ${token}` },
    })
    const meStatus = meRes.status
    let meJson: any = null
    try { meJson = await meRes.json() } catch {}

    // 4) Se tiver ml_user_id, testa /orders/search com seller=ID real
    const sellerId = meJson?.id || company.ml_uid
    let searchInfo: any = null
    if (sellerId) {
      const searchRes = await fetch(`https://api.mercadolibre.com/orders/search?seller=${sellerId}&order.status=paid&limit=5&offset=0`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const searchJson = await searchRes.json()
      searchInfo = {
        status: searchRes.status,
        total: searchJson.paging?.total,
        results_count: (searchJson.results || []).length,
        first_id: searchJson.results?.[0]?.id,
        first_date: searchJson.results?.[0]?.date_created,
      }
    }

    return NextResponse.json({
      ok: true,
      company: {
        id: company.id,
        nome_fantasia: company.nome_fantasia,
        has_token: company.has_token,
        has_refresh: company.has_refresh,
        ml_uid_db: company.ml_uid,
        ml_expires_at: company.ml_expires_at,
      },
      token_source: tokenRes?.source,
      token_company_id: tokenRes?.company_id,
      token_ml_user_id: tokenRes?.ml_user_id,
      users_me: meJson ? {
        status: meStatus,
        id: meJson.id,
        nickname: meJson.nickname,
        email: meJson.email,
        site_id: meJson.site_id,
        registration_date: meJson.registration_date,
      } : { status: meStatus },
      search: searchInfo,
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message, stack: e.stack }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}