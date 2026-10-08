import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

const BASIC = 'Basic ' + Buffer.from('premium:shine2026').toString('base64')

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== BASIC) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS plugin_configs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        plugin_id TEXT NOT NULL,
        company_id UUID NOT NULL,
        config JSONB NOT NULL,
        ativo BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(plugin_id, company_id)
      )
    `)
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_plugin_configs_company ON plugin_configs(company_id)
    `)
    return NextResponse.json({ ok: true, mensagem: '✅ Tabela plugin_configs criada/verificada' })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message })
  } finally {
    await prisma.$disconnect()
  }
}
