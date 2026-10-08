import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * Debug TOTAL — mostra TODOS os tokens ML salvos no banco
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Basic ${Buffer.from('premium:shine2026').toString('base64')}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // 1. Tokens em companies (novo, sistema multi-empresa)
    const companies: any[] = await prisma.$queryRawUnsafe(`
      SELECT id, nome_fantasia, cnpj, account_type,
        CASE WHEN access_token_ml IS NOT NULL THEN 'SIM' ELSE 'não' END as has_access,
        CASE WHEN refresh_token_ml IS NOT NULL THEN 'SIM' ELSE 'não' END as has_refresh,
        length(access_token_ml) as access_len,
        length(refresh_token_ml) as refresh_len,
        ml_user_id,
        ml_expires_at
      FROM companies
      ORDER BY account_type, nome_fantasia
    `)

    // 2. Tokens em marketplace_accounts (antigo, legacy)
    const marketplace: any[] = await prisma.$queryRawUnsafe(`
      SELECT id, plataforma, nickname, account_id,
        CASE WHEN access_token IS NOT NULL THEN 'SIM' ELSE 'não' END as has_access,
        CASE WHEN refresh_token IS NOT NULL THEN 'SIM' ELSE 'não' END as has_refresh,
        length(access_token) as access_len,
        length(refresh_token) as refresh_len,
        token_expira_em,
        company_id
      FROM marketplace_accounts
    `)

    return NextResponse.json({ ok: true, companies, marketplace_accounts: marketplace })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}