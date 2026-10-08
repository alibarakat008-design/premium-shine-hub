import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

/**
 * GET /api/admin/fix-token-mismatch
 *
 * BUG que aconteceu antes:
 * - O user conectou ML conta "ALAMEDA ORIENTAL" (ml_user_id 204402886)
 * - O `marketplace_accounts` foi salvo com company_id = a2176d33 (GH SHOP) — BUG
 * - O `companies.access_token_ml` ficou no GH SHOP
 * - Eu movi o `marketplace_accounts` de GH SHOP → ALAMEDA (correto)
 * - MAS esqueci de mover o `companies.access_token_ml` também!
 *
 * Resultado:
 * - ALAMEDA: tem marketplace_account, NÃO tem token → não consegue chamar ML
 * - GH SHOP: NÃO tem marketplace_account, TEM token (que é da ALAMEDA) → confusão
 *
 * Fix: mover o `companies.access_token_ml` da GH SHOP pra ALAMEDA.
 *
 * Secret: "LUXO2026" pra evitar execução acidental.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || ''
  if (!authHeader.startsWith('Basic ')) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }
  const { searchParams } = new URL(req.url)
  const secret = searchParams.get('secret')
  if (secret !== 'LUXO2026') {
    return NextResponse.json({ ok: false, error: 'Precisa de secret=LUXO2026' }, { status: 400 })
  }

  const ALAMEDA_COMPANY = '3b1d4a0a-b864-4177-a9ce-e122d2956766'
  const GHSHOP_COMPANY = 'a2176d33-f604-48cf-8d8a-df4313ce1417'

  try {
    // 1) Verifica estado atual
    const antes: any = await prisma.$queryRawUnsafe(`
      SELECT
        nome_fantasia,
        access_token_ml IS NOT NULL as has_token,
        refresh_token_ml IS NOT NULL as has_refresh,
        ml_user_id
      FROM companies
      WHERE id IN ($1::uuid, $2::uuid)
      ORDER BY nome_fantasia
    `, ALAMEDA_COMPANY, GHSHOP_COMPANY)

    // 2) Move o token da GH SHOP pra ALAMEDA
    const moveRes: any = await prisma.$queryRawUnsafe(`
      UPDATE companies
      SET access_token_ml = source.access_token_ml,
          refresh_token_ml = source.refresh_token_ml,
          ml_expires_at = source.ml_expires_at,
          ml_user_id = source.ml_user_id,
          updated_at = NOW()
      FROM companies source
      WHERE companies.id = $1::uuid
        AND source.id = $2::uuid
      RETURNING companies.nome_fantasia
    `, ALAMEDA_COMPANY, GHSHOP_COMPANY)

    // 3) Limpa o token da GH SHOP
    await prisma.$queryRawUnsafe(`
      UPDATE companies SET
        access_token_ml = NULL,
        refresh_token_ml = NULL,
        ml_expires_at = NULL,
        ml_user_id = NULL,
        updated_at = NOW()
      WHERE id = $1::uuid
    `, GHSHOP_COMPANY)

    // 4) Estado final
    const depois: any = await prisma.$queryRawUnsafe(`
      SELECT
        nome_fantasia,
        access_token_ml IS NOT NULL as has_token,
        refresh_token_ml IS NOT NULL as has_refresh,
        ml_user_id
      FROM companies
      WHERE id IN ($1::uuid, $2::uuid)
      ORDER BY nome_fantasia
    `, ALAMEDA_COMPANY, GHSHOP_COMPANY)

    return NextResponse.json({
      ok: true,
      message: '✅ Token movido de GH SHOP → ALAMEDA',
      antes: antes.map((c: any) => ({ ...c, ml_user_id: c.ml_user_id?.toString() })),
      moveu: moveRes.length,
      depois: depois.map((c: any) => ({ ...c, ml_user_id: c.ml_user_id?.toString() })),
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message?.substring(0, 500) }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}