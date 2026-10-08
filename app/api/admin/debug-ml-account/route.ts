import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || ''
    if (!authHeader.startsWith('Basic ')) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    const { searchParams } = new URL(req.url)
    const companyId = searchParams.get('company_id')

    // Todas as contas ML
    const allAccounts = await prisma.marketplace_accounts.findMany({
      select: {
        id: true,
        nickname: true,
        account_id: true,
        company_id: true,
        access_token: true,
        token_expira_em: true,
      },
    })

    // Vendas por company_id (últimas 24h)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const vendasByCompany: any = {}
    for (const acc of allAccounts) {
      const count = await prisma.orders.count({
        where: {
          company_id: acc.company_id || undefined,
          created_at: { gte: oneDayAgo },
        },
      })
      vendasByCompany[acc.nickname] = count
    }

    // Vendas SEM company_id (caem na matriz)
    const vendasSemCompany = await prisma.orders.count({
      where: { company_id: null, created_at: { gte: oneDayAgo } },
    })

    return NextResponse.json({
      ok: true,
      contas: allAccounts.map(a => ({
        nickname: a.nickname,
        ml_user_id: a.account_id,
        company_id: a.company_id,
        has_token: !!a.access_token,
        token_expira: a.token_expira_em,
        vendas_24h: vendasByCompany[a.nickname] || 0,
      })),
      vendas_sem_company_24h: vendasSemCompany,
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message, stack: e.stack }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}