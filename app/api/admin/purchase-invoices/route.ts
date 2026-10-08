import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

/**
 * GET /api/admin/purchase-invoices
 * Lista notas de compra (com itens)
 *
 * Query params:
 *   - company_id (filtra por empresa)
 *   - limit (default 100)
 *   - status (sugerida|aprovada|enviada|recebida|cancelada)
 *
 * POST /api/admin/purchase-invoices
 * Body: { company_id, supplier_id, numero_nota_fiscal, chave_acesso_nf,
 *         data_pedido, previsao_entrega, data_recebimento, status,
 *         condicao_pagamento, observacoes, items: [{ product_id, sku, quantidade, custo_unitario }] }
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || ''
  if (!authHeader.startsWith('Basic ')) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }
  const { searchParams } = new URL(req.url)
  const companyId = searchParams.get('company_id')
  const status = searchParams.get('status')
  const limit = Math.min(Number(searchParams.get('limit') || 100), 500)

  try {
    const where: any = {}
    if (companyId) where.company_id = companyId
    if (status) where.status = status

    const rows: any = await prisma.$queryRawUnsafe(`
      SELECT
        sp.id, sp.company_id, sp.supplier_id, sp.status, sp.valor_total,
        sp.data_pedido, sp.previsao_entrega, sp.data_recebimento, sp.condicao_pagamento,
        sp.numero_nota_fiscal, sp.chave_acesso_nf, sp.observacoes, sp.created_at, sp.updated_at,
        s.nome AS supplier_nome, s.cnpj AS supplier_cnpj,
        c.nome_fantasia AS company_nome
      FROM supplier_purchases sp
      LEFT JOIN suppliers s ON s.id = sp.supplier_id
      LEFT JOIN companies c ON c.id = sp.company_id
      ${companyId ? `WHERE sp.company_id = '${companyId}'::uuid` : ''}
      ${companyId && status ? `AND sp.status = '${status}'` : (!companyId && status ? `WHERE sp.status = '${status}'` : '')}
      ORDER BY COALESCE(sp.data_pedido, sp.created_at) DESC
      LIMIT ${limit}
    `)

    // Pega itens em batch
    const purchaseIds = rows.map((r: any) => r.id)
    let itemsByPurchase: Record<string, any[]> = {}
    if (purchaseIds.length > 0) {
      const items: any = await prisma.$queryRawUnsafe(`
        SELECT
          spi.id, spi.purchase_id, spi.product_id, spi.quantidade,
          spi.custo_unitario, spi.custo_total,
          p.sku, p.nome AS produto_nome
        FROM supplier_purchase_items spi
        LEFT JOIN products p ON p.id = spi.product_id
        WHERE spi.purchase_id = ANY($1::uuid[])
        ORDER BY spi.id
      `, purchaseIds)
      for (const it of items) {
        if (!itemsByPurchase[it.purchase_id]) itemsByPurchase[it.purchase_id] = []
        itemsByPurchase[it.purchase_id].push({
          id: it.id,
          product_id: it.product_id,
          sku: it.sku,
          produto_nome: it.produto_nome,
          quantidade: Number(it.quantidade),
          custo_unitario: it.custo_unitario != null ? Number(it.custo_unitario) : null,
          custo_total: it.custo_total != null ? Number(it.custo_total) : null,
        })
      }
    }

    const result = rows.map((r: any) => ({
      id: r.id,
      company_id: r.company_id,
      company_nome: r.company_nome,
      supplier_id: r.supplier_id,
      supplier_nome: r.supplier_nome,
      supplier_cnpj: r.supplier_cnpj,
      status: r.status,
      valor_total: r.valor_total != null ? Number(r.valor_total) : null,
      data_pedido: r.data_pedido,
      previsao_entrega: r.previsao_entrega,
      data_recebimento: r.data_recebimento,
      condicao_pagamento: r.condicao_pagamento,
      numero_nota_fiscal: r.numero_nota_fiscal,
      chave_acesso_nf: r.chave_acesso_nf,
      observacoes: r.observacoes,
      created_at: r.created_at,
      updated_at: r.updated_at,
      items: itemsByPurchase[r.id] || [],
    }))

    return NextResponse.json({ ok: true, total: result.length, notas: result })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || ''
  if (!authHeader.startsWith('Basic ')) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const body = await req.json()
    const {
      company_id, supplier_id, numero_nota_fiscal, chave_acesso_nf,
      data_pedido, previsao_entrega, data_recebimento, status,
      condicao_pagamento, observacoes, items,
    } = body

    if (!company_id) {
      return NextResponse.json({ ok: false, error: 'company_id obrigatório' }, { status: 400 })
    }
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ ok: false, error: 'items[] obrigatório' }, { status: 400 })
    }

    // Calcula valor total a partir dos itens
    const valorTotal = items.reduce((s: number, it: any) => {
      const q = Number(it.quantidade || 0)
      const c = Number(it.custo_unitario || 0)
      return s + q * c
    }, 0)

    // 1) Cria a purchase
    const purchaseRes: any = await prisma.$queryRawUnsafe(`
      INSERT INTO supplier_purchases (
        company_id, supplier_id, status, valor_total,
        data_pedido, previsao_entrega, data_recebimento,
        condicao_pagamento, numero_nota_fiscal, chave_acesso_nf, observacoes,
        created_at
      ) VALUES (
        $1::uuid, $2::uuid, $3::purchase_status, $4,
        $5::timestamp, $6::date, $7::timestamp,
        $8, $9, $10, $11,
        NOW()
      )
      RETURNING id
    `,
      company_id,
      supplier_id || null,
      status || 'recebida',
      valorTotal,
      data_pedido || null,
      previsao_entrega || null,
      data_recebimento || null,
      condicao_pagamento || null,
      numero_nota_fiscal || null,
      chave_acesso_nf || null,
      observacoes || null,
    )

    const purchaseId = purchaseRes[0].id

    // 2) Insere itens
    for (const it of items) {
      const q = Number(it.quantidade || 0)
      const c = Number(it.custo_unitario || 0)
      const ct = q * c
      await prisma.$queryRawUnsafe(`
        INSERT INTO supplier_purchase_items (
          purchase_id, product_id, quantidade, custo_unitario, custo_total
        ) VALUES ($1::uuid, $2::uuid, $3, $4, $5)
      `, purchaseId, it.product_id || null, q, c, ct)
    }

    // 3) Recalcula custo médio (ponderado) por produto e atualiza product_prices.custo
    await recalcularCustoMedio(company_id, items)

    return NextResponse.json({
      ok: true,
      message: `Nota ${numero_nota_fiscal || purchaseId.substring(0, 8)} criada com ${items.length} itens. Custo médio recalculado.`,
      purchase_id: purchaseId,
      valor_total: valorTotal,
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}

/**
 * Recalcula custo médio PONDERADO (por quantidade) a partir de TODAS as notas RECEBIDAS
 * de cada produto e atualiza product_prices.custo (canal='manual')
 *
 * Fórmula: custo_medio = SUM(custo_unitario * quantidade) / SUM(quantidade)
 */
async function recalcularCustoMedio(companyId: string, items: any[]) {
  // Pega IDs únicos dos produtos afetados
  const productIds = [...new Set(items.map((i: any) => i.product_id).filter(Boolean))]
  if (productIds.length === 0) return

  for (const productId of productIds) {
    // Calcula média ponderada a partir de TODAS as notas recebidas
    const media: any = await prisma.$queryRawUnsafe(`
      SELECT
        COALESCE(SUM(spi.custo_unitario * spi.quantidade) / NULLIF(SUM(spi.quantidade), 0), 0) AS custo_medio_pond,
        COUNT(DISTINCT sp.id) AS qtd_notas,
        SUM(spi.quantidade)::int AS qtd_total
      FROM supplier_purchase_items spi
      JOIN supplier_purchases sp ON sp.id = spi.purchase_id
      WHERE spi.product_id = $1::uuid
        AND sp.company_id = $2::uuid
        AND sp.status = 'recebida'
    `, productId, companyId)

    const custoMedio = media[0]?.custo_medio_pond
      ? Number(media[0].custo_medio_pond)
      : null
    if (custoMedio == null) continue

    // Atualiza/insere em product_prices (canal='manual' tem prioridade)
    await prisma.$queryRawUnsafe(`
      INSERT INTO product_prices (product_id, company_id, canal, custo, preco_venda, updated_at)
      VALUES ($1::uuid, $2::uuid, 'manual', $3, 0, NOW())
      ON CONFLICT (product_id, canal, company_id) DO UPDATE SET
        custo = EXCLUDED.custo,
        updated_at = NOW()
    `, productId, companyId, custoMedio)
  }
}