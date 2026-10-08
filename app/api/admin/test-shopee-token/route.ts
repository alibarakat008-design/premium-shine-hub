import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { testShopeeToken, getShopeeEnvInfo } from '@/lib/shopee-auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * GET /api/admin/test-shopee-token?company_id=X
 *
 * Testa se o token Shopee da empresa X ainda tá válido,
 * chamando /api/v2/shop/get_shop_info.
 *
 * Returns: { ok, shop_info?, error?, env }
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const companyId = searchParams.get('company_id')
    if (!companyId) return NextResponse.json({ ok: false, error: 'company_id obrigatório' }, { status: 400 })

    const env = getShopeeEnvInfo()
    const result = await testShopeeToken(companyId)
    return NextResponse.json({ ...result, env })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}
