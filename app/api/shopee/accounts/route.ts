/**
 * =====================================================
 * API DE CONTAS SHOPEE
 * =====================================================
 * Lista contas conectadas
 * =====================================================
 */

// app/api/shopee/accounts/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {

  const accounts = await prisma.marketplace_accounts.findMany({
    where: { plataforma: 'shopee' },
    include: {
      companies: { select: { id: true, cnpj: true, nome_fantasia: true } },
      _count: { select: { marketplace_listings: true } },
    },
    orderBy: { created_at: 'desc' },
  })

  return NextResponse.json({
    success: true,
    data: accounts.map((a) => ({
      id: a.id,
      nickname: a.nickname,
      account_id: a.account_id,
      company: a.companies,
      ativa: a.ativa,
      total_listings: a._count.marketplace_listings,
      token_expira_em: a.token_expira_em,
      ultima_sincronizacao: a.ultima_sincronizacao,
      token_expirado: a.token_expira_em ? new Date(a.token_expira_em) < new Date() : true,
    })),
  })
}
