// Cria a tabela monthly_goals
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS monthly_goals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID,
    ano INTEGER NOT NULL,
    mes INTEGER NOT NULL,
    meta_receita DECIMAL(12,2) DEFAULT 0,
    meta_pedidos INTEGER DEFAULT 0,
    meta_margem_pct DECIMAL(5,2) DEFAULT 0,
    observacoes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_monthly_goals_unique ON monthly_goals(company_id, ano, mes)`,
  `CREATE INDEX IF NOT EXISTS idx_monthly_goals_periodo ON monthly_goals(ano, mes)`,
]

export async function POST(req: NextRequest) {
  const results: string[] = []
  try {
    for (const sql of STATEMENTS) {
      try {
        await prisma.$executeRawUnsafe(sql)
        results.push(`OK: ${sql.slice(0, 60)}...`)
      } catch (e: any) {
        results.push(`FAIL: ${e.message?.slice(0, 100)}`)
      }
    }
    return NextResponse.json({ ok: true, results })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
