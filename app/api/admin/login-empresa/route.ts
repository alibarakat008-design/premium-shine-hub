// /app/api/admin/login-empresa/route.ts
// POST: seta cookies de sessão por empresa
// GET: retorna sessão atual
// Via Management API (serverless-safe)
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

export async function POST(req: NextRequest) {
  if (!PAT) {
    return NextResponse.json({ ok: false, error: 'Servidor em manutenção' }, { status: 503 })
  }
  const auth = req.headers.get('authorization')
  if (auth !== `Basic ${Buffer.from('premium:shine2026').toString('base64')}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { company_id } = body
    if (!company_id) {
      return NextResponse.json({ ok: false, error: 'company_id obrigatório' }, { status: 400 })
    }

    const safeId = company_id.replace(/'/g, "''")
    const companies = await mgmtQuery(
      `SELECT id, nome_fantasia, razao_social, account_type, cnpj FROM companies WHERE id = '${safeId}'::uuid`
    )
    if (companies.length === 0) {
      return NextResponse.json({ ok: false, error: 'Empresa não encontrada' }, { status: 404 })
    }

    const company = companies[0]
    const role = company.account_type
    const isMatriz = role === 'matriz'

    const res = NextResponse.json({
      ok: true,
      message: isMatriz
        ? `Login como matriz: ${company.nome_fantasia} (vê TODAS empresas)`
        : `Login como ${role}: ${company.nome_fantasia} (vê SÓ suas próprias vendas)`,
      company,
      role,
      is_matriz: isMatriz,
    })

    res.cookies.set('psh_session_company', company_id, {
      httpOnly: false,
      sameSite: 'lax',
      maxAge: 365 * 24 * 60 * 60,
      path: '/',
    })
    res.cookies.set('psh_session_role', role, {
      httpOnly: false,
      sameSite: 'lax',
      maxAge: 365 * 24 * 60 * 60,
      path: '/',
    })
    if (isMatriz) {
      res.cookies.delete('psh_active_company')
    } else {
      res.cookies.set('psh_active_company', company_id, {
        httpOnly: false,
        sameSite: 'lax',
        maxAge: 365 * 24 * 60 * 60,
        path: '/',
      })
    }
    return res
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  if (!PAT) {
    return NextResponse.json({ ok: false, error: 'Servidor em manutenção' }, { status: 503 })
  }
  const auth = req.headers.get('authorization')
  if (auth !== `Basic ${Buffer.from('premium:shine2026').toString('base64')}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const companyId = req.cookies.get('psh_session_company')?.value
  const role = req.cookies.get('psh_session_role')?.value

  if (!companyId) {
    return NextResponse.json({ ok: true, session: null, message: 'Nenhuma sessão ativa' })
  }

  try {
    const safeId = companyId.replace(/'/g, "''")
    const companies = await mgmtQuery(
      `SELECT id, nome_fantasia, razao_social, account_type, cnpj FROM companies WHERE id = '${safeId}'::uuid`
    )
    return NextResponse.json({
      ok: true,
      session: companies[0] || null,
      role,
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}
