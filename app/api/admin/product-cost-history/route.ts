// /api/admin/product-cost-history
// GET ?product_id=X — retorna histórico de compras via Management API (sem Prisma)
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
  if (!res.ok) throw new Error(`Management API ${res.status}: ${await res.text()}`)
  const text = await res.text()
  if (!text.trim()) return []
  try {
    const json = JSON.parse(text)
    if (Array.isArray(json)) return json
    if (json && typeof json === 'object') {
      if (json.error) throw new Error(json.error)
      if (Object.keys(json).every(k => !isNaN(Number(k)))) return Object.values(json)
      return [json]
    }
    return []
  } catch {
    return []
  }
}

export async function GET(req: NextRequest) {
  if (!PAT) {
    return NextResponse.json({ ok: false, error: 'Servidor em manutenção' }, { status: 503 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const productId = searchParams.get('product_id')
    if (!productId) {
      return NextResponse.json({ ok: false, error: 'product_id obrigatório' }, { status: 400 })
    }

    // Histórico via supplier_purchase_items (Notas de Compra)
    const items = await mgmtQuery(`
      SELECT
        spi.purchase_id,
        sp.numero_nota_fiscal,
        sp.data_pedido,
        su.nome as supplier_nome,
        spi.quantidade,
        spi.custo_unitario,
        spi.custo_total,
        p.sku,
        p.nome as produto_nome
      FROM supplier_purchase_items spi
      JOIN supplier_purchases sp ON sp.id = spi.purchase_id
      LEFT JOIN suppliers su ON su.id = sp.supplier_id
      LEFT JOIN products p ON p.id = spi.product_id
      WHERE spi.product_id = '${productId.replace(/'/g, "''")}'::uuid
        AND spi.custo_unitario IS NOT NULL
      ORDER BY sp.data_pedido DESC
      LIMIT 20
    `)

    const historico = (Array.isArray(items) ? items : []).map((i: any) => ({
      purchase_id: i.purchase_id,
      numero_nota_fiscal: i.numero_nota_fiscal,
      data_pedido: i.data_pedido,
      supplier_nome: i.supplier_nome,
      quantidade: Number(i.quantidade || 0),
      custo_unitario: Number(i.custo_unitario || 0),
      custo_total: i.custo_total != null ? Number(i.custo_total) : Number(i.custo_unitario || 0) * Number(i.quantidade || 1),
      sku: i.sku,
      produto_nome: i.produto_nome,
    }))

    return NextResponse.json({ ok: true, total: historico.length, historico })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message?.substring(0, 500) }, { status: 500 })
  }
}
