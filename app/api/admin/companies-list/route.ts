import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || ''
    if (!authHeader.startsWith('Basic ')) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }
    const companies = await prisma.$queryRawUnsafe(`
      SELECT id::text, nome_fantasia, cnpj, account_type
      FROM companies
      ORDER BY nome_fantasia
    `)
    return NextResponse.json({ ok: true, companies })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
