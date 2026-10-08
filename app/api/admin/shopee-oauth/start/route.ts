import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getShopeeAuthUrl } from '@/lib/shopee-auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * GET /api/admin/shopee-oauth/start?company_id=X
 *
 * Gera URL OAuth da Shopee pra empresa X conectar a conta dela.
 * Redireciona o user pro Shopee autorizar.
 *
 * O Shopee redireciona de volta pra /api/admin/shopee-oauth/callback?code=X&shop_id=X&state=X
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const companyId = searchParams.get('company_id')

    if (!companyId) {
      return NextResponse.json({ ok: false, error: 'company_id obrigatório' }, { status: 400 })
    }

    // Valida company
    const company: any[] = await prisma.$queryRawUnsafe(
      `SELECT id, nome_fantasia, account_type FROM companies WHERE id = $1::uuid`,
      companyId,
    )
    if (company.length === 0) {
      return NextResponse.json({ ok: false, error: 'Empresa não encontrada' }, { status: 404 })
    }

    const origin = new URL(req.url).origin
    const redirectUri = `${origin}/api/admin/shopee-oauth/callback`

    // Gera URL Shopee
    const authUrl = getShopeeAuthUrl(companyId, redirectUri)
    return NextResponse.redirect(authUrl)
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}
