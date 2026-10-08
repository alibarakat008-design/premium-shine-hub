import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

const BASIC = 'Basic ' + Buffer.from('premium:shine2026').toString('base64')

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== BASIC) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  const companyId = req.nextUrl.searchParams.get('company_id') || 'e2633570-74da-4b14-9ca1-ba7b0670e612'
  try {
    const r: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        ma.id, ma.plataforma, ma.account_id, ma.nickname,
        ma.token_expira_em,
        LENGTH(ma.access_token) as token_size,
        LENGTH(ma.refresh_token) as refresh_size
      FROM marketplace_accounts ma
      WHERE ma.company_id = $1::uuid AND ma.plataforma = 'mercado_livre'
    `, companyId)
    return NextResponse.json({ ok: true, accounts: JSON.parse(JSON.stringify(r, (_, v) => typeof v === 'bigint' ? Number(v) : v)) })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message })
  } finally {
    await prisma.$disconnect()
  }
}
