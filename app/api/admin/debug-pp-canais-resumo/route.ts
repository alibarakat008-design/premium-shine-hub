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
    // Pega product_prices agrupado por canal
    const r: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        canal::text as canal,
        COUNT(*)::int as qtd,
        COUNT(*) FILTER (WHERE custo > 0)::int as com_custo,
        COUNT(*) FILTER (WHERE custo IS NULL OR custo = 0)::int as sem_custo
      FROM product_prices
      WHERE company_id = $1::uuid
      GROUP BY canal
      ORDER BY canal
    `, companyId)
    // Conta product_prices duplicados por (product_id, company_id) — múltiplos canais
    const dup: any[] = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*)::int as total_produtos, COUNT(*) FILTER (WHERE qtd_canais > 1)::int as com_multiplos_canais
      FROM (
        SELECT product_id, COUNT(DISTINCT canal) as qtd_canais
        FROM product_prices
        WHERE company_id = $1::uuid
        GROUP BY product_id
      ) sub
    `, companyId)
    return NextResponse.json({ ok: true, por_canal: r, dup: dup[0] })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message })
  } finally {
    await prisma.$disconnect()
  }
}
