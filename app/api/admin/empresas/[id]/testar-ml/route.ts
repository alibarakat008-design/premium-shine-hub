import { NextRequest, NextResponse } from 'next/server'
import { getMLToken } from '@/lib/ml-auth-multi'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/empresas/[id]/testar-ml
 * Pega o token da empresa (com auto-refresh se necessário) e testa com /users/me
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = req.headers.get('authorization')
  if (auth !== `Basic ${Buffer.from('premium:shine2026').toString('base64')}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const tokenInfo = await getMLToken(params.id)
    if (!tokenInfo) {
      return NextResponse.json({
        ok: false,
        error: 'Sem access_token cadastrado pra esta empresa',
      }, { status: 400 })
    }

    // Testa com /users/me
    const r = await fetch('https://api.mercadolibre.com/users/me', {
      headers: { Authorization: `Bearer ${tokenInfo.token}` },
    })

    if (!r.ok) {
      return NextResponse.json({
        ok: false,
        error: `HTTP ${r.status} — token pode estar expirado`,
      })
    }

    const data = await r.json()
    return NextResponse.json({
      ok: true,
      user_id: data.id,
      nickname: data.nickname,
      email: data.email,
      country: data.country_id,
      expires_at: tokenInfo.expires_at,
      token_source: tokenInfo.source,
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}