import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || ''
    if (!authHeader.startsWith('Basic ')) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }
    const accounts = await prisma.$queryRawUnsafe(`
      SELECT ma.id::text, ma.nickname, ma.marketplace, ma.ml_user_id::text, ma.shopee_shop_id,
             c.nome_fantasia as company_nome, ma.company_id::text
      FROM marketplace_accounts ma
      LEFT JOIN companies c ON c.id = ma.company_id
      ORDER BY ma.marketplace, ma.nickname
    `)
    return NextResponse.json({ ok: true, accounts })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
