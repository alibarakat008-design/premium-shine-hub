// /app/api/admin/kit-produtos/route.ts
// GET: buscar composicao de kits
// PUT: atualizar composicao de um kit (substitui todos os componentes)
// PATCH: marcar produto como kit/unitario
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

// GET — composicao do kit ou kits de um componente
export async function GET(req: NextRequest) {
  if (!PAT) return NextResponse.json({ error: 'Servidor em manutencao' }, { status: 503 })
  try {
    const { searchParams } = new URL(req.url)
    const kit_id = (searchParams.get('kit_id') || '').replace(/'/g, "''")
    const component_id = (searchParams.get('component_id') || '').replace(/'/g, "''")

    let sql = ''

    if (kit_id) {
      // Componentes de um kit
      sql = `
        SELECT
          kc.id,
          kc.kit_product_id,
          kc.component_product_id,
          kc.quantidade,
          p.sku,
          p.nome,
          p.foto_principal_url,
          COALESCE(inv.quantidade_atual, 0)::int as estoque
        FROM kit_compositions kc
        JOIN products p ON p.id = kc.component_product_id
        LEFT JOIN inventory inv ON inv.product_id = p.id
        WHERE kc.kit_product_id = '${kit_id}'::uuid
        ORDER BY p.nome ASC
      `
      const components = await mgmtQuery(sql)
      // Tambem busca info do kit
      const kitInfo = await mgmtQuery(`SELECT p.id, p.nome, p.sku, p.tipo_produto FROM products p WHERE p.id = '${kit_id}'::uuid LIMIT 1`)
      return NextResponse.json({ ok: true, kit: kitInfo[0] || null, components })
    }

    if (component_id) {
      // Kits que contem um componente
      sql = `
        SELECT
          kc.id,
          kc.kit_product_id,
          kc.quantidade,
          p.sku,
          p.nome,
          p.foto_principal_url,
          p.tipo_produto,
          b.nome as brand_nome,
          COALESCE(inv.quantidade_atual, 0)::int as estoque
        FROM kit_compositions kc
        JOIN products p ON p.id = kc.kit_product_id
        LEFT JOIN brands b ON b.id = p.marca_id
        LEFT JOIN inventory inv ON inv.product_id = p.id
        WHERE kc.component_product_id = '${component_id}'::uuid
        ORDER BY p.nome ASC
      `
      const kits = await mgmtQuery(sql)
      return NextResponse.json({ ok: true, kits })
    }

    // Sem filtro — retorna todos os kits e componentes
    const allKits = await mgmtQuery(`
      SELECT
        p.id, p.nome, p.sku, p.tipo_produto, p.foto_principal_url,
        b.nome as brand_nome,
        COALESCE(inv.quantidade_atual, 0)::int as estoque,
        (SELECT COUNT(*) FROM kit_compositions WHERE kit_product_id = p.id)::int as qtd_componentes
      FROM products p
      LEFT JOIN brands b ON b.id = p.marca_id
      LEFT JOIN inventory inv ON inv.product_id = p.id
      WHERE p.tipo_produto = 'kit'
      ORDER BY p.nome ASC
    `)
    return NextResponse.json({ ok: true, kits: allKits })

  } catch (err: any) {
    console.error('[kit-produtos GET]', err)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

// PUT — atualizar composicao de um kit (substitui todos os componentes)
export async function PUT(req: NextRequest) {
  if (!isMatrizRequest(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!PAT) return NextResponse.json({ error: 'Servidor em manutencao' }, { status: 503 })
  try {
    const body = await req.json()
    const { kit_id, components } = body

    if (!kit_id) return NextResponse.json({ ok: false, error: 'kit_id obrigatorio' }, { status: 400 })

    // components = array de { component_product_id, quantidade }
    const kitId = kit_id.replace(/'/g, "''")

    // Remove composicao atual
    await mgmtExec(`DELETE FROM kit_compositions WHERE kit_product_id = '${kitId}'::uuid`)

    // Insere nova composicao
    const inserted = []
    for (const c of (components || [])) {
      if (!c.component_product_id) continue
      const compId = c.component_product_id.replace(/'/g, "''")
      const qtd = parseInt(c.quantidade || 1)
      try {
        await mgmtExec(`
          INSERT INTO kit_compositions (kit_product_id, component_product_id, quantidade)
          VALUES ('${kitId}'::uuid, '${compId}'::uuid, ${qtd})
          ON CONFLICT (kit_product_id, component_product_id) DO UPDATE SET quantidade = EXCLUDED.quantidade
        `)
        inserted.push(c.component_product_id)
      } catch { /* silently skip duplicates */ }
    }

    // Marca produto como kit
    await mgmtExec(`UPDATE products SET tipo_produto = 'kit' WHERE id = '${kitId}'::uuid`)

    return NextResponse.json({ ok: true, kit_id, components: inserted })
  } catch (err: any) {
    console.error('[kit-produtos PUT]', err)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

// PATCH — marcar tipo de produto (kit/unitario)
export async function PATCH(req: NextRequest) {
  if (!isMatrizRequest(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!PAT) return NextResponse.json({ error: 'Servidor em manutencao' }, { status: 503 })
  try {
    const body = await req.json()
    const { product_id, tipo_produto } = body

    if (!product_id) return NextResponse.json({ ok: false, error: 'product_id obrigatorio' }, { status: 400 })
    if (!['kit', 'unitario'].includes(tipo_produto)) {
      return NextResponse.json({ ok: false, error: 'tipo_produto invalido' }, { status: 400 })
    }

    const pid = product_id.replace(/'/g, "''")
    await mgmtExec(`UPDATE products SET tipo_produto = '${tipo_produto}' WHERE id = '${pid}'::uuid`)

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[kit-produtos PATCH]', err)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

// DELETE — remover componente de um kit
export async function DELETE(req: NextRequest) {
  if (!isMatrizRequest(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!PAT) return NextResponse.json({ error: 'Servidor em manutencao' }, { status: 503 })
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ ok: false, error: 'id obrigatorio' }, { status: 400 })

    const eid = id.replace(/'/g, "''")
    await mgmtExec(`DELETE FROM kit_compositions WHERE id = '${eid}'::uuid`)

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[kit-produtos DELETE]', err)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
