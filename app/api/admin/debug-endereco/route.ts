// GET /api/admin/debug-endereco
// Debug: mostra 5 enderecos_entrega pra ver o formato
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    const sample = await prisma.orders.findMany({
      where: { endereco_entrega: { not: null } },
      select: { id: true, order_number: true, endereco_entrega: true, created_at: true },
      take: 5,
      orderBy: { created_at: 'desc' },
    })
    const totalComEndereco = await prisma.orders.count({
      where: { endereco_entrega: { not: null } },
    })
    const total = await prisma.orders.count()
    return NextResponse.json({ ok: true, total, totalComEndereco, sample })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
