// /api/admin/produtos/delete?ids=id1,id2
// DELETE — remove produto(s) do DB
import { NextRequest, NextResponse } from 'next/server'
import { isMatrizRequest } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

const MANAGEMENT_API = 'https://api.supabase.com/v1/projects/ubpiaicdccbpdjjsctuz/database/query'
const PAT = process.env.SUPABASE_MANAGE_TOKEN

async function mgmtExec(sql: string): Promise<void> {
  const res = await fetch(MANAGEMENT_API, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${PAT}`, 'apikey': PAT!, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  if (!res.ok) throw new Error(`Management API error: ${res.status} ${await res.text()}`)
}

export async function DELETE(req: NextRequest) {
  if (!PAT) return NextResponse.json({ error: 'Servidor em manutencao' }, { status: 503 })
  if (!isMatrizRequest(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const { searchParams } = new URL(req.url)
    const idsParam = (searchParams.get('ids') || '').replace(/'/g, "''")
    if (!idsParam) return NextResponse.json({ ok: false, error: 'ids obrigatorio' }, { status: 400 })

    const ids = idsParam.split(',').map(id => id.trim()).filter(Boolean)
    if (ids.length === 0) return NextResponse.json({ ok: false, error: 'ids invalidos' }, { status: 400 })

    const idsStr = ids.map(id => `'${id}'`).join(',')
    await mgmtExec(`DELETE FROM products WHERE id IN (${idsStr})`)
    return NextResponse.json({ ok: true, removidos: ids.length })
  } catch (err: any) {
    console.error('[produtos delete]', err)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
