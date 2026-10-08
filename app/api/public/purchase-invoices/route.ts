import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifySessionFromCookies } from '@/lib/auth-parceiro'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

/**
 * GET /api/public/purchase-invoices?company_id=X
 * POST /api/public/purchase-invoices
 *
 * Endpoint PÚBLICO pro parceiro (sem Basic Auth) — usa cookie psh_auth_token
 * Pra listar/criar notas de compra da empresa parceira
 */
export async function GET(req: NextRequest) {
  try {
    const session = await verifySessionFromCookies(req.cookies)
    if (!session) {
      return NextResponse.json({ ok: false, error: 'Não autenticado' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const companyId = searchParams.get('company_id') || session.companyId
    const status = searchParams.get('status')
    const limit = Math.min(Number(searchParams.get('limit') || 100), 500)

    const where: any = { company_id: companyId }
    if (status) where.status = status

    const rows: any = await prisma.supplier_purchases.findMany({
      where,
      orderBy: [{ data_pedido: 'desc' }, { created_at: 'desc' }],
      take: limit,
    })

    // Pega itens + supplier
    const purchaseIds = rows.map((r: any) => r.id)
    let itemsByPurchase: Record<string, any[]> = {}
    if (purchaseIds.length > 0) {
      const items: any = await prisma.supplier_purchase_items.findMany({
        where: { purchase_id: { in: purchaseIds } },
        include: {
          products: { select: { sku: true, nome: true } },
        },
      })
      for (const it of items) {
        if (!itemsByPurchase[it.purchase_id]) itemsByPurchase[it.purchase_id] = []
        itemsByPurchase[it.purchase_id].push({
          id: it.id,
          product_id: it.product_id,
          sku: (it as any).products?.sku,
          produto_nome: (it as any).products?.nome,
          quantidade: Number(it.quantidade),
          custo_unitario: it.custo_unitario != null ? Number(it.custo_unitario) : null,
          custo_total: it.custo_total != null ? Number(it.custo_total) : null,
        })
      }
    }

    const suppliers = await prisma.suppliers.findMany({})
    const suppliersMap: Record<string, any> = {}
    for (const s of suppliers) suppliersMap[s.id] = s

    const result = rows.map((r: any) => ({
      ...r,
      valor_total: r.valor_total != null ? Number(r.valor_total) : null,
      supplier: suppliersMap[r.supplier_id] || null,
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
  try {
    const session = await verifySessionFromCookies(req.cookies)
    if (!session) {
      return NextResponse.json({ ok: false, error: 'Não autenticado' }, { status: 401 })
    }

    const body = await req.json()
    const companyId = body.company_id || session.companyId

    // Parceiro SÓ pode criar notas da própria empresa
    if (companyId !== session.companyId) {
      return NextResponse.json({ ok: false, error: 'Sem permissão pra essa empresa' }, { status: 403 })
    }

    const {
      supplier_id, numero_nota_fiscal, chave_acesso_nf,
      data_pedido, previsao_entrega, data_recebimento, status,
      condicao_pagamento, observacoes, items,
    } = body

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ ok: false, error: 'items[] obrigatório' }, { status: 400 })
    }

    const valorTotal = items.reduce((s: number, it: any) => {
      return s + Number(it.quantidade || 0) * Number(it.custo_unitario || 0)
    }, 0)

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
      companyId,
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

    for (const it of items) {
      const q = Number(it.quantidade || 0)
      const c = Number(it.custo_unitario || 0)
      await prisma.$queryRawUnsafe(`
        INSERT INTO supplier_purchase_items (purchase_id, product_id, quantidade, custo_unitario, custo_total)
        VALUES ($1::uuid, $2::uuid, $3, $4, $5)
      `, purchaseId, it.product_id || null, q, c, q * c)
    }

    // Recalcula custo médio
    await recalcularCustoMedio(companyId, items)

    return NextResponse.json({
      ok: true,
      message: `Nota criada com ${items.length} itens`,
      purchase_id: purchaseId,
      valor_total: valorTotal,
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}

async function recalcularCustoMedio(companyId: string, items: any[]) {
  const productIds = [...new Set(items.map((i: any) => i.product_id).filter(Boolean))]
  for (const productId of productIds) {
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

    const custoMedio = media[0]?.custo_medio_pond ? Number(media[0].custo_medio_pond) : null
    if (custoMedio == null) continue

    await prisma.$queryRawUnsafe(`
      INSERT INTO product_prices (product_id, company_id, canal, custo, preco_venda, updated_at)
      VALUES ($1::uuid, $2::uuid, 'manual', $3, 0, NOW())
      ON CONFLICT (product_id, canal, company_id) DO UPDATE SET
        custo = EXCLUDED.custo,
        updated_at = NOW()
    `, productId, companyId, custoMedio)
  }
}