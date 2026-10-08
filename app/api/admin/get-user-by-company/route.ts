/**
 * GET /api/admin/get-user-by-company?company_id=X
 * Retorna o user_id owner de uma empresa (pra gerar token HMAC)
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const companyId = searchParams.get('company_id')
  if (!companyId) {
    return NextResponse.json({ ok: false, error: 'company_id obrigatório' }, { status: 400 })
  }
  try {
    const users: any[] = await prisma.$queryRawUnsafe(`
      SELECT id::text AS id, nome, email, role::text AS role
      FROM users WHERE company_id = $1::uuid
      ORDER BY created_at ASC
    `, companyId)
    return NextResponse.json({ ok: true, users })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}