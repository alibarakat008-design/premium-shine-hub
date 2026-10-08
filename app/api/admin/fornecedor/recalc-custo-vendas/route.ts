/**
 * Recalcula inter_company_sales.custo_vendedor baseado em product_prices.custo_fornecedor
 *
 * POST /api/admin/fornecedor/recalc-custo-vendas
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || ''
    if (!authHeader.startsWith('Basic ')) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }

    // Pega todas as inter_company_sales e recalcula custo_vendedor
    // baseado nos items da company_purchases correspondente
    const updated: any[] = await prisma.$queryRawUnsafe(`
      WITH compras_recentes AS (
        SELECT
          cp.id::text as purchase_id,
          cp.company_id::text as buyer_company_id,
          cp.fornecedor_company_id::text as seller_company_id,
          cp.data_compra,
          cp.total::text as purchase_total,
          SUM(
            COALESCE(cpi.custo_unitario, 0) * COALESCE(cpi.quantidade, 0)
          )::text as soma_custo_informado
        FROM company_purchases cp
        LEFT JOIN company_purchase_items cpi ON cpi.purchase_id = cp.id
        WHERE cp.fornecedor_company_id IS NOT NULL
          AND cp.data_compra > NOW() - INTERVAL '90 days'
        GROUP BY cp.id, cp.company_id, cp.fornecedor_company_id, cp.data_compra, cp.total
      )
      SELECT
        purchase_id,
        buyer_company_id,
        seller_company_id,
        purchase_total,
        soma_custo_informado
      FROM compras_recentes
      ORDER BY data_compra DESC
    `)

    let recalculados = 0
    for (const c of updated) {
      // Calcula custo_vendedor baseado no custo_fornecedor
      // Pra cada item, pega o custo_fornecedor do seller
      // IMPORTANTE: items podem ter product_id NULL — nesse caso, busca via products.sku
      // E product_prices pode ter company_id NULL (global) — usar se nao achar da empresa
      const items: any[] = await prisma.$queryRawUnsafe(`
        SELECT
          cpi.quantidade,
          cpi.sku,
          COALESCE(
            (SELECT pp.custo_fornecedor::text
             FROM product_prices pp
             WHERE pp.product_id = COALESCE(cpi.product_id, (SELECT id FROM products WHERE sku = cpi.sku))
               AND (pp.company_id = '${c.seller_company_id}'::uuid OR pp.company_id IS NULL)
               AND pp.custo_fornecedor > 0
               AND pp.canal IN ('mercado_livre', 'manual')
             ORDER BY
               CASE WHEN pp.company_id = '${c.seller_company_id}'::uuid THEN 1 ELSE 2 END,
               CASE WHEN pp.canal = 'mercado_livre' THEN 1 ELSE 2 END
             LIMIT 1),
            '0'
          ) as custo_fornecedor
        FROM company_purchase_items cpi
        WHERE cpi.purchase_id = '${c.purchase_id}'::uuid
      `)

      let custoVendedor = 0
      for (const it of items) {
        const custo = it.custo_fornecedor ? Number(it.custo_fornecedor) : 0
        custoVendedor += custo * (Number(it.quantidade) || 1)
      }
      custoVendedor = Number(custoVendedor.toFixed(2))
      const lucro = Number((Number(c.purchase_total) - custoVendedor).toFixed(2))

      // UPDATE no inter_company_sale correspondente
      // Estratégia: achar a inter_company_sale com mesmo seller+buyer e total
      // criado próximo da data_compra (sem usar purchase_id que é UUID)
      const interRow: any[] = await prisma.$queryRawUnsafe(`
        SELECT id::text FROM inter_company_sales
        WHERE seller_company_id = '${c.seller_company_id}'::uuid
          AND buyer_company_id = '${c.buyer_company_id}'::uuid
          AND total::numeric = ${Number(c.purchase_total).toFixed(2)}
          AND (custo_vendedor = 0 OR custo_vendedor IS NULL)
        ORDER BY data_venda DESC
        LIMIT 1
      `)
      const interId = interRow[0]?.id
      if (interId) {
        await prisma.$executeRawUnsafe(`
          UPDATE inter_company_sales
          SET custo_vendedor = ${custoVendedor},
              lucro_vendedor = ${lucro}
          WHERE id = '${interId}'::uuid
        `)
        recalculados++
      }
    }

    return NextResponse.json({ ok: true, recalculados, total_analisados: updated.length })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  return POST(req)
}
