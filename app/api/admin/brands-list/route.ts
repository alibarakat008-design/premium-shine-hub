// /app/api/admin/brands-list/route.ts
// Lista marcas com contadores — via Management API (serverless-safe)
import { NextRequest, NextResponse } from 'next/server'
import { isMatrizRequest } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

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

export async function GET(req: NextRequest) {
  if (!isMatrizRequest(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }
  if (!PAT) {
    return NextResponse.json({ ok: false, error: 'SUPABASE_MANAGE_TOKEN não configurado' }, { status: 503 })
  }

  try {
    const sql = `
      SELECT
        b.id as marca_id,
        b.nome as marca_nome,
        b.logo_url as marca_logo,
        COUNT(p.id)::int as total,
        COUNT(*) FILTER (WHERE p.foto_principal_url IS NOT NULL AND p.foto_principal_url != '')::int as com_foto,
        COUNT(*) FILTER (WHERE p.ean IS NOT NULL AND p.ean != '')::int as com_ean,
        COUNT(*) FILTER (WHERE p.volume IS NOT NULL AND p.volume != '')::int as com_volume,
        COUNT(*) FILTER (WHERE COALESCE(pp.custo, 0) > 0)::int as com_custo,
        COALESCE(anunciados.count, 0)::int as anunciados
      FROM brands b
      LEFT JOIN products p ON p.marca_id = b.id
      LEFT JOIN product_prices pp ON pp.product_id = p.id AND pp.company_id = 'e2633570-74da-4b14-9ca1-ba7b0670e612'
      LEFT JOIN (
        SELECT p2.marca_id, COUNT(DISTINCT p2.id)::int as count
        FROM products p2
        JOIN marketplace_listings ml ON ml.product_id = p2.id
        JOIN marketplace_accounts ma ON ma.id = ml.account_id
        WHERE ma.company_id = 'e2633570-74da-4b14-9ca1-ba7b0670e612'
        GROUP BY p2.marca_id
      ) anunciados ON anunciados.marca_id = b.id
      GROUP BY b.id, b.nome, b.logo_url, anunciados.count
      ORDER BY b.nome ASC
    `

    const rows = await mgmtQuery(sql)

    return NextResponse.json({
      ok: true,
      total_marcas: rows.length,
      total_produtos: rows.reduce((a: number, r: any) => a + (r.total || 0), 0),
      total_anunciados: rows.reduce((a: number, r: any) => a + (r.anunciados || 0), 0),
      total_com_foto: rows.reduce((a: number, r: any) => a + (r.com_foto || 0), 0),
      custo_label: 'LIURA',
      custo_markup: 1.0,
      marcas: rows,
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message?.substring(0, 500) }, { status: 500 })
  }
}
