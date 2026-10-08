// Endpoint mínimo pra debug
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    const account = await prisma.marketplace_accounts.findFirst({
      where: { nickname: 'LIURAESSENCE' },
    })
    if (!account) return NextResponse.json({ ok: false, error: 'no account' }, { status: 404 })
    return NextResponse.json({ ok: true, account: { id: account.id, nickname: account.nickname, has_token: !!account.access_token } })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message, stack: err.stack }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    return NextResponse.json({ ok: true, message: 'POST works' })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message, stack: err.stack }, { status: 500 })
  }
}
