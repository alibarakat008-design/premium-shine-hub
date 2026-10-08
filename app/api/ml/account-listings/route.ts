/**
 * API: Listar listings de uma conta (ou todas)
 * GET /api/ml/account-listings?account_id=xxx
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const accountId = searchParams.get('account_id')
    const plataforma = searchParams.get('plataforma')

    const where: any = {}
    if (accountId) where.account_id = accountId
    if (plataforma) {
      where.marketplace_accounts = { plataforma }
    }

    const listings = await prisma.marketplace_listings.findMany({
      where,
      orderBy: { vendas_total: 'desc' },
      take: 500,
      include: {
        products: { select: { sku: true, nome: true, foto_principal_url: true } },
      },
    })
    return NextResponse.json({ success: true, data: listings })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
