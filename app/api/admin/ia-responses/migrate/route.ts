/**
 * POST /api/admin/ia-responses/migrate
 */
import { NextRequest, NextResponse } from 'next/server'
import { isMatrizRequest } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  if (!isMatrizRequest(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  try {
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS ia_training_responses (id UUID DEFAULT gen_random_uuid() PRIMARY KEY, question_pattern VARCHAR(255) NOT NULL, trained_response TEXT NOT NULL, category VARCHAR(50) DEFAULT 'general', ml_response TEXT, shopee_response TEXT, times_used INT DEFAULT 0, last_used TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`)
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_training_pattern ON ia_training_responses(question_pattern)`)
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_training_category ON ia_training_responses(category)`)
    return NextResponse.json({ ok: true, message: 'Tabela ia_training_responses criada.' })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
