import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isMatrizRequest } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET(req: NextRequest) {
  if (!isMatrizRequest(req)) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  try {
    const start = Date.now()
    const count = await prisma.products.count()
    const elapsed = Date.now() - start
    return NextResponse.json({ ok: true, count, elapsed_ms: elapsed })
  } catch (err: unknown) {
    const e = err as Error
    return NextResponse.json({ ok: false, error: e.message, stack: e.stack?.split('\n').slice(0,5) }, { status: 200 })
  }
}
