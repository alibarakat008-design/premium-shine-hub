/**
 * GET /api/admin/orders-by-ml-account?account_id=X
 * Lista orders vinculadas a uma conta ML específica, agrupadas por company
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const accountId = searchParams.get('account_id')
  if (!accountId) {
    return NextResponse.json({ ok: false, error: 'account_id obrigatório' }, { status: 400 })
  }
  try {
    const account: any = await prisma.marketplace_accounts.findUnique({
      where: { id: accountId },
      select: { id: true, nickname: true, account_id: true, company_id: true },
    })
    if (!account) {
      return NextResponse.json({ ok: false, error: 'Conta não encontrada' }, { status: 404 })
    }

    // Lista orders dessa conta, agrupadas por company
    const orders: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        o.id::text,
        o.order_number,
        o.total::float,
        o.status::text,
        o.created_at,
        c.nome_fantasia AS company_name,
        c.id::text AS company_id
      FROM orders o
      LEFT JOIN companies c ON c.id = o.company_id
      WHERE o.marketplace_account_id = $1::uuid
      ORDER BY o.created_at DESC
      LIMIT 50
    `, accountId)

    // Agrupa por company
    const byCompany = new Map<string, any>()
    for (const o of orders) {
      const key = o.company_id || 'sem_company'
      if (!byCompany.has(key)) {
        byCompany.set(key, { company_id: o.company_id, company_name: o.company_name, count: 0, sample: [] })
      }
      const entry = byCompany.get(key)
      entry.count++
      if (entry.sample.length < 3) {
        entry.sample.push({ order_number: o.order_number, total: o.total, status: o.status, created_at: o.created_at })
      }
    }

    return NextResponse.json({
      ok: true,
      account,
      total_orders: orders.length,
      by_company: Array.from(byCompany.values()),
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}