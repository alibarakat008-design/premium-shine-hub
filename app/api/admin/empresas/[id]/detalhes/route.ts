import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/empresas/[id]/detalhes
 * Retorna dados da empresa + status da conexão ML (SEM expor os tokens)
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = req.headers.get('authorization')
  if (auth !== `Basic ${Buffer.from('premium:shine2026').toString('base64')}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result: any[] = await prisma.$queryRawUnsafe(
      `SELECT
        id, cnpj, nome_fantasia, razao_social, account_type, ativa,
        email, ml_user_id, ml_expires_at,
        (access_token_ml IS NOT NULL AND access_token_ml != '__PENDING__') AS has_access_token,
        (refresh_token_ml IS NOT NULL) AS has_refresh_token,
        (access_token_ml = '__PENDING__') AS ml_pending
      FROM companies WHERE id = $1::uuid`,
      params.id,
    )

    if (result.length === 0) {
      return NextResponse.json({ ok: false, error: 'Empresa não encontrada' }, { status: 404 })
    }

    return NextResponse.json({ ok: true, company: result[0] })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message?.substring(0, 200) }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}