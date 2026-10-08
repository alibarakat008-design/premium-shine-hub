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
    const acc: any[] = await prisma.$queryRawUnsafe(`
      SELECT access_token, account_id as ml_user_id
      FROM marketplace_accounts
      WHERE company_id = $1::uuid AND plataforma = 'mercado_livre'
      LIMIT 1
    `, companyId)
    const token = acc[0]?.access_token
    const userId = Number(acc[0]?.ml_user_id)

    // 1) Com token Bearer
    const r1 = await fetch(`https://api.mercadolibre.com/orders/search?seller=${userId}&limit=1&offset=0`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    const j1 = await r1.json()

    // 2) Sem token
    const r2 = await fetch(`https://api.mercadolibre.com/orders/search?seller=${userId}&limit=1`)
    const j2 = await r2.json()

    return NextResponse.json({
      ok: true,
      ml_user_id: userId,
      with_token: { total: j1.paging?.total, results: j1.results?.length, status: j1.status, erro: j1.message || j1.error },
      without_token: { total: j2.paging?.total, results: j2.results?.length, status: j2.status, erro: j2.message || j2.error },
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message })
  } finally {
    await prisma.$disconnect()
  }
}
