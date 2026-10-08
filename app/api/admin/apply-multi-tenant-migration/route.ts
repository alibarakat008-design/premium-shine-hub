import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/apply-multi-tenant-migration
 *
 * Adiciona:
 *  - users.company_id
 *  - companies.access_token_ml / refresh_token_ml / ml_user_id / ml_expires_at
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Basic ${Buffer.from('premium:shine2026').toString('base64')}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const results: string[] = []

  try {
    // 1. users.company_id
    try {
      await prisma.$queryRawUnsafe(`
        ALTER TABLE users ADD COLUMN IF NOT EXISTS company_id UUID
      `)
      results.push('✓ users.company_id')
    } catch (e: any) {
      results.push('✗ users.company_id: ' + e.message.substring(0, 100))
    }

    // 2. index em users.company_id
    try {
      await prisma.$queryRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_users_company ON users(company_id)
      `)
      results.push('✓ idx_users_company')
    } catch (e: any) {
      results.push('✗ idx_users_company: ' + e.message.substring(0, 100))
    }

    // 3. companies.access_token_ml
    try {
      await prisma.$queryRawUnsafe(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS access_token_ml TEXT`)
      results.push('✓ companies.access_token_ml')
    } catch (e: any) {
      results.push('✗ companies.access_token_ml: ' + e.message.substring(0, 100))
    }

    // 4. companies.refresh_token_ml
    try {
      await prisma.$queryRawUnsafe(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS refresh_token_ml TEXT`)
      results.push('✓ companies.refresh_token_ml')
    } catch (e: any) {
      results.push('✗ companies.refresh_token_ml: ' + e.message.substring(0, 100))
    }

    // 5. companies.ml_user_id
    try {
      await prisma.$queryRawUnsafe(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS ml_user_id BIGINT`)
      results.push('✓ companies.ml_user_id')
    } catch (e: any) {
      results.push('✗ companies.ml_user_id: ' + e.message.substring(0, 100))
    }

    // 6. companies.ml_expires_at
    try {
      await prisma.$queryRawUnsafe(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS ml_expires_at TIMESTAMP`)
      results.push('✓ companies.ml_expires_at')
    } catch (e: any) {
      results.push('✗ companies.ml_expires_at: ' + e.message.substring(0, 100))
    }

    // 7. Verifica usuários existentes
    const users: any[] = await prisma.$queryRawUnsafe(`
      SELECT id, email, role, company_id FROM users ORDER BY email LIMIT 10
    `)

    return NextResponse.json({
      ok: true,
      message: 'Multi-tenant migration aplicada',
      steps: results,
      users,
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message, steps: results }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}