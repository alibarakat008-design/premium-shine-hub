import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * GET /api/admin/add-ml-token-columns
 *
 * Adiciona colunas access_token_ml, refresh_token_ml, ml_expires_at, ml_user_id
 * à tabela companies (necessário pro OAuth callback funcionar).
 *
 * Idempotente (usa ADD COLUMN IF NOT EXISTS).
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Basic ${Buffer.from('premium:shine2026').toString('base64')}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // 1) Adicionar colunas (idempotente)
    const statements = [
      `ALTER TABLE companies ADD COLUMN IF NOT EXISTS access_token_ml TEXT`,
      `ALTER TABLE companies ADD COLUMN IF NOT EXISTS refresh_token_ml TEXT`,
      `ALTER TABLE companies ADD COLUMN IF NOT EXISTS ml_expires_at TIMESTAMP`,
      `ALTER TABLE companies ADD COLUMN IF NOT EXISTS ml_user_id BIGINT`,
    ]
    for (const sql of statements) {
      try {
        await prisma.$queryRawUnsafe(sql)
        console.log('[add-ml-token-columns] OK:', sql.substring(0, 80))
      } catch (e: any) {
        console.log('[add-ml-token-columns] ERR:', e.message?.substring(0, 200))
      }
    }

    // 2) Verificar
    const check: any = await prisma.$queryRawUnsafe(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'companies'
         AND column_name IN ('access_token_ml', 'refresh_token_ml', 'ml_expires_at', 'ml_user_id')`
    )
    const cols = check.map(c => c.column_name)

    return NextResponse.json({
      ok: true,
      message: `Colunas presentes: ${cols.join(', ')}`,
      columns: cols,
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}