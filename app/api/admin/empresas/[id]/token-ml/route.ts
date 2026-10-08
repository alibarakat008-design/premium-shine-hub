import { NextRequest, NextResponse } from 'next/server'
import { testMLToken } from '@/lib/ml-auth-multi'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/empresas/[id]/token-ml
 * Body: { access_token: string, refresh_token?: string }
 * Salva tokens manuais (pra quem já gerou fora do sistema)
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = req.headers.get('authorization')
  if (auth !== `Basic ${Buffer.from('premium:shine2026').toString('base64')}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { access_token, refresh_token } = body

    if (!access_token) {
      return NextResponse.json({ ok: false, error: 'access_token obrigatório' }, { status: 400 })
    }

    // Testa o token primeiro
    const test = await testMLToken(access_token)
    if (!test.ok) {
      return NextResponse.json({
        ok: false,
        error: `Token inválido: ${test.error}`,
      }, { status: 400 })
    }

    // Salva (expires_in = 6h = 21600s, padrão ML)
    const expiresAt = new Date(Date.now() + 6 * 60 * 60 * 1000)
    await prisma.$queryRawUnsafe(`
      UPDATE companies SET
        access_token_ml = $2,
        refresh_token_ml = $3,
        ml_expires_at = $4,
        ml_user_id = $5,
        updated_at = NOW()
      WHERE id = $1::uuid
    `, params.id, access_token, refresh_token || null, expiresAt, test.user_id)

    return NextResponse.json({
      ok: true,
      message: 'Tokens salvos com sucesso',
      test,
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}

/**
 * DELETE /api/admin/empresas/[id]/token-ml
 * Remove os tokens ML desta empresa
 */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = req.headers.get('authorization')
  if (auth !== `Basic ${Buffer.from('premium:shine2026').toString('base64')}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    await prisma.$queryRawUnsafe(`
      UPDATE companies SET
        access_token_ml = NULL,
        refresh_token_ml = NULL,
        ml_expires_at = NULL,
        ml_user_id = NULL,
        updated_at = NOW()
      WHERE id = $1::uuid
    `, params.id)

    return NextResponse.json({ ok: true, message: 'Tokens removidos' })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}