import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * GET /api/admin/check-tokens-status
 * Debug: mostra o status dos tokens ML de cada empresa
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || ''
  if (!authHeader.startsWith('Basic ')) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const result: any = await prisma.$queryRawUnsafe(`
      SELECT
        nome_fantasia,
        ml_user_id::text as ml_user_id_str,
        ml_expires_at,
        CASE WHEN access_token_ml IS NULL THEN 'NULL'
             WHEN access_token_ml = '__PENDING__' THEN 'PENDING'
             WHEN access_token_ml LIKE 'APP_USR-%' THEN 'VALID'
             ELSE 'OTHER' END as token_status,
        CASE WHEN refresh_token_ml IS NULL THEN 'NULL'
             WHEN refresh_token_ml LIKE 'TG-%' THEN 'VALID'
             ELSE 'OTHER' END as refresh_status
      FROM companies
      ORDER BY nome_fantasia
    `)
    return NextResponse.json({ ok: true, companies: result })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message?.substring(0, 300) }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}