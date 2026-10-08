import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * Testa se access_token renovado funciona.
 * Pega da LIURAESSENCE (default), ou company_id via query.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Basic ${Buffer.from('premium:shine2026').toString('base64')}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const companyId = searchParams.get('company_id') || 'e2633570-74da-4b14-9ca1-ba7b0670e612'

  try {
    const compRes: any[] = await prisma.$queryRawUnsafe(
      `SELECT access_token_ml, refresh_token_ml, ml_user_id, ml_expires_at FROM companies WHERE id = $1::uuid`,
      companyId,
    )
    if (compRes.length === 0 || !compRes[0].access_token_ml) {
      return NextResponse.json({ ok: false, error: 'Sem token' })
    }
    const token = compRes[0].access_token_ml

    // Testa /users/me
    const r = await fetch('https://api.mercadolibre.com/users/me', {
      headers: { Authorization: `Bearer ${token}` },
    })
    const body = await r.json().catch(() => ({}))
    return NextResponse.json({
      ok: r.ok,
      status: r.status,
      ml_user_id_in_db: compRes[0].ml_user_id ? Number(compRes[0].ml_user_id) : null,
      ml_response: r.ok ? body : body,
      token_first_4: token.substring(0, 4),
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}