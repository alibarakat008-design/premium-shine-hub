// Verifica quantos listings tem envio_full = true
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    const total = await prisma.marketplace_listings.count()
    const comFull = await prisma.marketplace_listings.count({ where: { envio_full: true } })
    const sample = await prisma.marketplace_listings.findMany({
      take: 5,
      select: { id: true, listing_id: true, envio_full: true, stock_disponivel_ml: true, listing_type: true },
    })
    const porTipo = await prisma.marketplace_listings.groupBy({
      by: ['listing_type'],
      _count: true,
    })
    return NextResponse.json({
      ok: true,
      total,
      com_full: comFull,
      sample,
      por_listing_type: porTipo,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
