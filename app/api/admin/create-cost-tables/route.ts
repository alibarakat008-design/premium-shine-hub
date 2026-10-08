// Cria tabelas de custos via SQL direto (não precisa de prisma db push)
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS cost_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome VARCHAR(100) NOT NULL,
    tipo VARCHAR(20) NOT NULL,
    icone VARCHAR(50),
    cor VARCHAR(20),
    ordem INTEGER DEFAULT 0,
    ativa BOOLEAN DEFAULT true,
    company_id UUID,
    created_at TIMESTAMP DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_cost_categories_company ON cost_categories(company_id)`,
  `CREATE TABLE IF NOT EXISTS monthly_costs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category_id UUID NOT NULL REFERENCES cost_categories(id) ON DELETE NO ACTION ON UPDATE NO ACTION,
    company_id UUID,
    ano INTEGER NOT NULL,
    mes INTEGER NOT NULL,
    descricao VARCHAR(255),
    valor DECIMAL(10,2) NOT NULL,
    categoria_nome VARCHAR(100),
    pago_em DATE,
    observacoes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_monthly_costs_periodo ON monthly_costs(ano, mes)`,
  `CREATE INDEX IF NOT EXISTS idx_monthly_costs_company ON monthly_costs(company_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_monthly_costs_unique ON monthly_costs(category_id, ano, mes, descricao)`,
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
    return NextResponse.json({ ok: false, error: err.message, results }, { status: 500 })
  }
}

