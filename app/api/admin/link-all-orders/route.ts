// Linka TODOS os orders ML à conta LIURAESSENCE de uma vez (1 query).
// Uso: GET /api/admin/link-all-orders?secret=LUXO2026

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  if (searchParams.get('secret') !== 'LUXO2026') {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  try {
    const account = await prisma.marketplace_accounts.findFirst({ where: { nickname: 'LIURAESSENCE' } })
    if (!account) return NextResponse.json({ ok: false, error: 'Conta LIURAESSENCE não encontrada' }, { status: 404 })

    // Update em batch (1 query SQL)
    const result = await prisma.orders.updateMany({
      where: {
        origem: 'mercado_livre',
        marketplace_account_id: null,
      },
      data: {
        marketplace_account_id: account.id,
      },
    })

    return NextResponse.json({
      ok: true,
      message: `✅ ${result.count} orders linkados à conta LIURAESSENCE`,
      linked: result.count,
      account_id: account.id,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
