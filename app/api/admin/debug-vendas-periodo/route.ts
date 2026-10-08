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
    const stats: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        COUNT(*)::int as total,
        MIN(created_at) as primeira_venda,
        MAX(created_at) as ultima_venda,
        COUNT(*) FILTER (WHERE EXTRACT(YEAR FROM created_at) = 2024)::int as vendas_2024,
        COUNT(*) FILTER (WHERE EXTRACT(YEAR FROM created_at) = 2025)::int as vendas_2025,
        COUNT(*) FILTER (WHERE EXTRACT(YEAR FROM created_at) = 2026)::int as vendas_2026,
        COUNT(*) FILTER (WHERE created_at IS NULL)::int as sem_data
      FROM orders
      WHERE company_id = $1::uuid AND origem = 'mercado_livre'::order_origem
    `, companyId)
    const porMes: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') as mes,
        COUNT(*)::int as vendas,
        COALESCE(SUM(total), 0)::float as receita
      FROM orders
      WHERE company_id = $1::uuid AND origem = 'mercado_livre'::order_origem
      GROUP BY DATE_TRUNC('month', created_at)
      ORDER BY mes
    `, companyId)
    return NextResponse.json({
      ok: true,
      stats: JSON.parse(JSON.stringify(stats[0], (_, v) => typeof v === 'bigint' ? Number(v) : v)),
      por_mes: JSON.parse(JSON.stringify(porMes, (_, v) => typeof v === 'bigint' ? Number(v) : v)),
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message })
  } finally {
    await prisma.$disconnect()
  }
}
