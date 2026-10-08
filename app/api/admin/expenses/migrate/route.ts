/**
 * POST /api/admin/expenses/migrate
 */
import { NextRequest, NextResponse } from 'next/server'
import { isMatrizRequest } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  if (!isMatrizRequest(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  try {
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS expenses (id UUID DEFAULT gen_random_uuid() PRIMARY KEY, description VARCHAR(255) NOT NULL, amount DECIMAL(10,2) NOT NULL, category_type VARCHAR(20) NOT NULL, category VARCHAR(50) NOT NULL DEFAULT 'outros', due_date DATE NOT NULL, paid_date DATE, status VARCHAR(20) DEFAULT 'pending', recurrence VARCHAR(20) DEFAULT 'monthly', notes TEXT, company_id UUID, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`)
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_expenses_type ON expenses(category_type)`)
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_expenses_status ON expenses(status)`)
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_expenses_due_date ON expenses(due_date)`)
    return NextResponse.json({ ok: true, message: 'Tabela expenses criada.' })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}
