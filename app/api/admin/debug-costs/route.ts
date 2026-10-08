import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const total = await prisma.monthly_costs.count()
    const samples = await prisma.monthly_costs.findMany({
      take: 10,
      orderBy: [{ ano: 'desc' }, { mes: 'desc' }],
      include: { category: { select: { nome: true, tipo: true } } },
    })
    const cats = await prisma.cost_categories.findMany({
      select: { id: true, nome: true, tipo: true },
      orderBy: { nome: 'asc' },
    })
    return NextResponse.json({
      success: true,
      total,
      samples,
      categorias: cats,
    })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
