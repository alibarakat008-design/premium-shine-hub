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
    // Testa com um ID específico
    const testId = '2000017212770684'
    const r: any[] = await prisma.$queryRawUnsafe(`
      SELECT order_number FROM orders WHERE company_id = $1::uuid AND order_number = $2
    `, companyId, testId)
    return NextResponse.json({
      ok: true,
      test_id: testId,
      test_id_type: typeof testId,
      found_in_db: r.length,
      found_value: r[0]?.order_number,
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message })
  } finally {
    await prisma.$disconnect()
  }
}
