import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/apply-user-role-enum
 * Adiciona 'parceiro' e 'empresa_owner' ao enum user_role
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Basic ${Buffer.from('premium:shine2026').toString('base64')}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const results: string[] = []
  try {
    // Postgres: ALTER TYPE ... ADD VALUE
    try {
      await prisma.$queryRawUnsafe(`ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'parceiro'`)
      results.push('✓ adicionado: parceiro')
    } catch (e: any) {
      if (e.message.includes('already exists')) {
        results.push('✓ parceiro já existe')
      } else {
        results.push('✗ parceiro: ' + e.message.substring(0, 100))
      }
    }

    try {
      await prisma.$queryRawUnsafe(`ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'empresa_owner'`)
      results.push('✓ adicionado: empresa_owner')
    } catch (e: any) {
      if (e.message.includes('already exists')) {
        results.push('✓ empresa_owner já existe')
      } else {
        results.push('✗ empresa_owner: ' + e.message.substring(0, 100))
      }
    }

    // Verificar
    const values: any[] = await prisma.$queryRawUnsafe(`
      SELECT unnest(enum_range(NULL::user_role)) AS value
    `)
    results.push('Valores do enum: ' + values.map(v => v.value).join(', '))

    return NextResponse.json({ ok: true, steps: results })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message, steps: results }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}