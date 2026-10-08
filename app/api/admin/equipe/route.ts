/**
 * API: Equipe / Colaboradores
 * GET    /api/admin/equipe          — lista colaboradores
 * POST   /api/admin/equipe           — cria colaborador
 * PUT    /api/admin/equipe?id=X      — atualiza
 * DELETE /api/admin/equipe?id=X      — remove
 * Via Management API (serverless-safe)
 */
import { NextRequest, NextResponse } from 'next/server'
import { isMatrizRequest } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

const MANAGEMENT_API = 'https://api.supabase.com/v1/projects/ubpiaicdccbpdjjsctuz/database/query'
const PAT = process.env.SUPABASE_MANAGE_TOKEN

async function mgmtQuery(sql: string): Promise<any[]> {
  const res = await fetch(MANAGEMENT_API, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${PAT}`, 'apikey': PAT!, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  if (!res.ok) throw new Error(`Management API error: ${res.status} ${await res.text()}`)
  const text = await res.text()
  if (!text.trim()) return []
  try {
    const json = JSON.parse(text)
    if (Array.isArray(json)) return json
    if (json && typeof json === 'object' && json.error) throw new Error(json.error)
    return json && typeof json === 'object' ? [json] : []
  } catch {
    return []
  }
}

async function mgmtExec(sql: string): Promise<void> {
  const res = await fetch(MANAGEMENT_API, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${PAT}`, 'apikey': PAT!, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  if (!res.ok) throw new Error(`Management API error: ${res.status} ${await res.text()}`)
}

function sanitize(s: string | null | undefined) {
  return (s || '').replace(/'/g, "''")
}

export async function GET(req: NextRequest) {
  if (!PAT) return NextResponse.json({ error: 'Servidor em manutencao' }, { status: 503 })
  if (!isMatrizRequest(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  try {
    const { searchParams } = new URL(req.url)
    const ativo = searchParams.get('ativo')
    const busca = (searchParams.get('busca') || '').replace(/'/g, "''")

    let sql = `SELECT id, nome, cargo, foto_url, telefone, email, data_nascimento, data_admissao, salario_base, ativo, observacao, company_id, created_at FROM equipe WHERE 1=1`
    if (ativo === 'true') sql += ` AND ativo = true`
    if (ativo === 'false') sql += ` AND ativo = false`
    if (busca) sql += ` AND (LOWER(nome) LIKE '%${busca}%' OR LOWER(cargo) LIKE '%${busca}%')`
    sql += ` ORDER BY nome ASC`

    const membros = await mgmtQuery(sql)
    return NextResponse.json({ ok: true, data: membros })
  } catch (err: any) {
    console.error('[equipe GET]', err)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  if (!PAT) return NextResponse.json({ error: 'Servidor em manutencao' }, { status: 503 })
  if (!isMatrizRequest(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  try {
    const body = await req.json()
    const { nome, cargo, foto_url, telefone, email, data_nascimento, data_admissao, salario_base, observacao, company_id } = body

    if (!nome?.trim()) return NextResponse.json({ ok: false, error: 'Nome obrigatorio' }, { status: 400 })

    const id = crypto.randomUUID()
    const cols = [
      `id = '${id}'`,
      `nome = '${sanitize(nome)}'`,
      cargo !== undefined ? `cargo = ${cargo ? "'" + sanitize(cargo) + "'" : 'NULL'}` : 'cargo = NULL',
      foto_url !== undefined ? `foto_url = ${foto_url ? "'" + sanitize(foto_url) + "'" : 'NULL'}` : 'foto_url = NULL',
      telefone !== undefined ? `telefone = ${telefone ? "'" + sanitize(telefone) + "'" : 'NULL'}` : 'telefone = NULL',
      email !== undefined ? `email = ${email ? "'" + sanitize(email) + "'" : 'NULL'}` : 'email = NULL',
      data_nascimento ? `data_nascimento = '${data_nascimento}'` : 'data_nascimento = NULL',
      data_admissao ? `data_admissao = '${data_admissao}'` : 'data_admissao = NULL',
      salario_base !== undefined ? `salario_base = ${parseFloat(salario_base) || 0}` : 'salario_base = 0',
      observacao !== undefined ? `observacao = ${observacao ? "'" + sanitize(observacao) + "'" : 'NULL'}` : 'observacao = NULL',
      company_id ? `company_id = '${sanitize(company_id)}'::uuid` : 'company_id = NULL',
      `ativo = true`,
    ]

    await mgmtExec(`INSERT INTO equipe (${cols.join(', ')})`)
    const inserted = await mgmtQuery(`SELECT * FROM equipe WHERE id = '${id}' LIMIT 1`)
    return NextResponse.json({ ok: true, data: inserted[0] || { id, nome } })
  } catch (err: any) {
    console.error('[equipe POST]', err)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  if (!PAT) return NextResponse.json({ error: 'Servidor em manutencao' }, { status: 503 })
  if (!isMatrizRequest(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  try {
    const { searchParams } = new URL(req.url)
    const id = (searchParams.get('id') || '').replace(/'/g, "''")
    if (!id) return NextResponse.json({ ok: false, error: 'ID obrigatorio' }, { status: 400 })

    const body = await req.json()
    const { nome, cargo, foto_url, telefone, email, data_nascimento, data_admissao, salario_base, ativo, observacao } = body

    const sets: string[] = []
    if (nome !== undefined) sets.push(`nome = '${sanitize(nome)}'`)
    if (cargo !== undefined) sets.push(`cargo = ${cargo ? "'" + sanitize(cargo) + "'" : 'NULL'}`)
    if (foto_url !== undefined) sets.push(`foto_url = ${foto_url ? "'" + sanitize(foto_url) + "'" : 'NULL'}`)
    if (telefone !== undefined) sets.push(`telefone = ${telefone ? "'" + sanitize(telefone) + "'" : 'NULL'}`)
    if (email !== undefined) sets.push(`email = ${email ? "'" + sanitize(email) + "'" : 'NULL'}`)
    if (data_nascimento !== undefined) sets.push(`data_nascimento = ${data_nascimento ? "'" + data_nascimento + "'" : 'NULL'}`)
    if (data_admissao !== undefined) sets.push(`data_admissao = ${data_admissao ? "'" + data_admissao + "'" : 'NULL'}`)
    if (salario_base !== undefined) sets.push(`salario_base = ${parseFloat(String(salario_base)) || 0}`)
    if (ativo !== undefined) sets.push(`ativo = ${ativo}`)
    if (observacao !== undefined) sets.push(`observacao = ${observacao ? "'" + sanitize(observacao) + "'" : 'NULL'}`)
    sets.push(`updated_at = NOW()`)

    await mgmtExec(`UPDATE equipe SET ${sets.join(', ')} WHERE id = '${id}'::uuid`)
    const updated = await mgmtQuery(`SELECT * FROM equipe WHERE id = '${id}'::uuid LIMIT 1`)
    return NextResponse.json({ ok: true, data: updated[0] || null })
  } catch (err: any) {
    console.error('[equipe PUT]', err)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  if (!PAT) return NextResponse.json({ error: 'Servidor em manutencao' }, { status: 503 })
  if (!isMatrizRequest(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  try {
    const { searchParams } = new URL(req.url)
    const id = (searchParams.get('id') || '').replace(/'/g, "''")
    if (!id) return NextResponse.json({ ok: false, error: 'ID obrigatorio' }, { status: 400 })

    await mgmtExec(`DELETE FROM equipe WHERE id = '${id}'::uuid`)
    return NextResponse.json({ ok: true, message: 'Removido com sucesso' })
  } catch (err: any) {
    console.error('[equipe DELETE]', err)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
