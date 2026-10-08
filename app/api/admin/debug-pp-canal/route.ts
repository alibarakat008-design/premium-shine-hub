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
    const semCanal: any[] = await prisma.$queryRawUnsafe(`
      SELECT COUNT(DISTINCT oi.product_id)::int as produtos, COUNT(*)::int as itens
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.company_id = $1::uuid AND o.status != 'cancelado'
        AND oi.product_id IS NOT NULL
        AND (oi.custo_unitario IS NULL OR oi.custo_unitario = 0)
        AND NOT EXISTS (
          SELECT 1 FROM product_prices pp
          WHERE pp.product_id = oi.product_id AND pp.company_id = $1::uuid AND pp.custo > 0
        )
    `, companyId)
    const comCanal: any[] = await prisma.$queryRawUnsafe(`
      SELECT COUNT(DISTINCT oi.product_id)::int as produtos, COUNT(*)::int as itens
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.company_id = $1::uuid AND o.status != 'cancelado'
        AND oi.product_id IS NOT NULL
        AND (oi.custo_unitario IS NULL OR oi.custo_unitario = 0)
        AND NOT EXISTS (
          SELECT 1 FROM product_prices pp
          WHERE pp.product_id = oi.product_id AND pp.company_id = $1::uuid
            AND pp.custo > 0 AND pp.canal = 'mercado_livre'::canal_venda
        )
    `, companyId)
    return NextResponse.json({
      ok: true,
      sem_canal_filtro: semCanal[0],
      com_canal_mercado_livre: comCanal[0],
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message })
  } finally {
    await prisma.$disconnect()
  }
}
