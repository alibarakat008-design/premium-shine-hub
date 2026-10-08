// /app/api/ml/accounts/route.ts
// GET: lista contas Mercado Livre — via Management API (serverless-safe)
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const MANAGEMENT_API = 'https://api.supabase.com/v1/projects/ubpiaicdccbpdjjsctuz/database/query'
const PAT = process.env.SUPABASE_MANAGE_TOKEN

async function mgmtQuery(sql: string): Promise<any[]> {
  const res = await fetch(MANAGEMENT_API, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${PAT}`,
      'apikey': PAT!,
      'Content-Type': 'application/json',
      'Prefer': 'params=single-object',
    },
    body: JSON.stringify({ query: sql }),
  })
  if (!res.ok) throw new Error(`Management API error: ${res.status} ${await res.text()}`)
  const text = await res.text()
  if (!text.trim()) return []
  try {
    const json = JSON.parse(text)
    if (Array.isArray(json)) return json
    if (json && typeof json === 'object') {
      if (json.error) throw new Error(json.error)
      return [json]
    }
    return []
  } catch {
    return []
  }
}

export async function GET() {
  if (!PAT) {
    return NextResponse.json({ success: false, error: 'Servidor em manutenção' }, { status: 503 })
  }

  try {
    const accounts = await mgmtQuery(`
      SELECT
        ma.id,
        ma.nickname,
        ma.account_id,
        ma.ativa,
        ma.token_expira_em,
        ma.ultima_sincronizacao,
        ma.sync_status,
        ma.sync_progress,
        ma.sync_result,
        c.id as company_id,
        c.cnpj as company_cnpj,
        c.nome_fantasia as company_nome,
        (SELECT COUNT(*) FROM marketplace_listings ml WHERE ml.account_id = ma.id)::int as total_listings
      FROM marketplace_accounts ma
      LEFT JOIN companies c ON c.id = ma.company_id
      WHERE ma.plataforma = 'mercado_livre'
      ORDER BY ma.created_at DESC
    `)

    return NextResponse.json({
      success: true,
      data: accounts.map((a: any) => ({
        id: a.id,
        nickname: a.nickname,
        account_id: a.account_id,
        company: { id: a.company_id, cnpj: a.company_cnpj, nome_fantasia: a.company_nome },
        ativa: a.ativa,
        total_listings: a.total_listings,
        token_expira_em: a.token_expira_em,
        ultima_sincronizacao: a.ultima_sincronizacao,
        sync_status: a.sync_status,
        sync_progress: a.sync_progress,
        sync_result: a.sync_result,
        token_expirado: a.token_expira_em ? new Date(a.token_expira_em) < new Date() : true,
      })),
    })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
