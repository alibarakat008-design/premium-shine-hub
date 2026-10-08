import { NextRequest, NextResponse } from 'next/server'
import { isMatrizRequest } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * POST /api/admin/exec-sql
 *
 * Executa SQL via Supabase Management API (HTTPS) — uso interno, pra fluxos
 * de manutenção (ex: consultas/ajustes pontuais direto do painel).
 * Não precisa de conexão TCP direta — funciona em qualquer ambiente serverless.
 *
 * Body: { secret, sql, action? }
 *   - action="write": permite DELETE e UPDATE
 *
 * Variáveis necessárias (definir só no Painel da Vercel, nunca aqui no código):
 *   SUPABASE_MANAGE_TOKEN=<sbp_... do Supabase Personal Access Token>
 *   EXEC_SQL_SECRET=<valor aleatório forte — gere com `openssl rand -hex 32` ou
 *                     `python3 -c "import secrets; print(secrets.token_hex(32))"`.
 *                     Trocado em 2026-08-31 porque o valor antigo estava
 *                     documentado aqui mesmo no comentário — nunca deixe o
 *                     valor real neste arquivo, só o nome da variável.>
 */
export async function POST(req: NextRequest) {
  if (!isMatrizRequest(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const requiredSecret = process.env.EXEC_SQL_SECRET
  if (!requiredSecret) {
    return NextResponse.json({ ok: false, error: 'EXEC_SQL_SECRET não configurado' }, { status: 503 })
  }

  const body = await req.json().catch(() => null)
  const secret = body?.secret
  const sql = body?.sql
  const action = body?.action // 'delete' para permitir DELETE

  if (secret !== requiredSecret) {
    return NextResponse.json({ ok: false, error: 'secret inválido' }, { status: 401 })
  }
  if (!sql || typeof sql !== 'string') {
    return NextResponse.json({ ok: false, error: 'sql obrigatório' }, { status: 400 })
  }

  const trimmed = sql.trim().toUpperCase()
  // UPDATE também é permitido com action='write'
  const blocked = /\b(DROP|TRUNCATE|ALTER|CREATE|INSERT|GRANT|REVOKE)\b/i
  if (trimmed.startsWith('SELECT')) {
    // SELECT é livre
  } else if ((trimmed.startsWith('DELETE') || trimmed.startsWith('UPDATE')) && action === 'write') {
    // DELETE e UPDATE só com action=write
  } else {
    return NextResponse.json({ ok: false, error: 'SQL bloqueado: apenas SELECT ou DELETE/UPDATE com action=write' }, { status: 400 })
  }
  if (blocked.test(sql)) {
    return NextResponse.json({ ok: false, error: 'SQL bloqueado por segurança' }, { status: 400 })
  }

  const manageToken = process.env.SUPABASE_MANAGE_TOKEN
  if (!manageToken) {
    return NextResponse.json({ ok: false, error: 'SUPABASE_MANAGE_TOKEN não configurado' }, { status: 503 })
  }

  try {
    const res = await fetch(
      'https://api.supabase.com/v1/projects/ubpiaicdccbpdjjsctuz/database/query',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${manageToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: sql }),
      }
    )

    const text = await res.text()

    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: `Supabase API error ${res.status}: ${text.substring(0, 300)}` },
        { status: 502 }
      )
    }

    let result
    try {
      result = JSON.parse(text)
    } catch {
      result = [{ raw: text }]
    }

    const rows = Array.isArray(result) ? result : [result]
    return NextResponse.json({ ok: true, result: rows, count: rows.length })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message?.substring(0, 500) }, { status: 500 })
  }
}
