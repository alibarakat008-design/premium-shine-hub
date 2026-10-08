// Aplica migrações do schema via prisma
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    // Tenta criar uma query que precisa da nova tabela
        try {
      const cats = await (prisma as any).cost_categories.findMany({ take: 1 })
      const costs = await (prisma as any).monthly_costs.findMany({ take: 1 })
      return NextResponse.json({ ok: true, cats_count: cats.length, costs_count: costs.length, message: 'tabelas já existem' })
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: e.message, code: e.code }, { status: 500 })
    } finally {
      await prisma.$disconnect()
    }
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
