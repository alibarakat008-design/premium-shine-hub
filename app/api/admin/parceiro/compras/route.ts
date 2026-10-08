/**
 * API de COMPRAS entre empresas (parceiro registra o que comprou).
 *
 * Fluxo típico:
 *   - Parceiro (ex: GH SHOP) acessa sua área
 *   - Clica em "Registrar compra"
 *   - Informa fornecedor (LIURA ou outro), produto, qtd, custo unitário
 *   - Sistema registra em `company_purchases` + `company_purchase_items`
 *   - Atualiza `product_prices.custo_fornecedor` (custo de aquisição do parceiro)
 *   - Cria `inter_company_sale` (LIURA vê no dashboard dela)
 *
 * GET  /api/admin/parceiro/compras?days=30&company_id=PARCEIRO
 * POST /api/admin/parceiro/compras
 *   body: { company_id, fornecedor_company_id, items: [{product_id, sku, nome, quantidade, custo_unitario}], observacoes? }
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const companyId = searchParams.get('company_id')
    const days = Math.max(1, Number(searchParams.get('days') || 30))

    if (!companyId) {
      return NextResponse.json({ ok: false, error: 'company_id obrigatório' }, { status: 400 })
    }

    const rows: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        cp.id::text as id,
        cp.company_id::text as company_id,
        cp.fornecedor_company_id::text as fornecedor_company_id,
        fc.nome_fantasia as fornecedor_nome,
        cp.numero_pedido,
        cp.data_compra,
        cp.data_recebimento,
        cp.total::text as total,
        cp.status,
        cp.observacoes,
        COUNT(cpi.id)::int as qtd_items
      FROM company_purchases cp
      LEFT JOIN companies fc ON fc.id = cp.fornecedor_company_id
      LEFT JOIN company_purchase_items cpi ON cpi.purchase_id = cp.id
      WHERE cp.company_id = '${companyId}'::uuid
        AND cp.data_compra > NOW() - (INTERVAL '${days} days')
      GROUP BY cp.id, fc.nome_fantasia
      ORDER BY cp.data_compra DESC
    `)

    return NextResponse.json({ ok: true, compras: rows })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { company_id, fornecedor_company_id, numero_pedido, items, observacoes, data_recebimento } = body

    if (!company_id) {
      return NextResponse.json({ ok: false, error: 'company_id obrigatório' }, { status: 400 })
    }
    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ ok: false, error: 'items[] obrigatório' }, { status: 400 })
    }

    // 1) Calcula total
    let total = 0
    for (const it of items) {
      const qty = Number(it.quantidade || 1)
      const custo = Number(it.custo_unitario || 0)
      total += qty * custo
    }
    total = Number(total.toFixed(2))

    // 2) Cria company_purchases
    const purchaseRes: any[] = await prisma.$queryRawUnsafe(`
      INSERT INTO company_purchases
        (company_id, fornecedor_company_id, numero_pedido, total, status, observacoes, data_recebimento)
      VALUES
        ('${company_id}'::uuid, ${fornecedor_company_id ? `'${fornecedor_company_id}'::uuid` : 'NULL'},
         ${numero_pedido ? `'${numero_pedido.replace(/'/g, "''")}'` : 'NULL'},
         ${total}, 'pendente', ${observacoes ? `'${observacoes.replace(/'/g, "''").substring(0, 500)}'` : 'NULL'},
         ${data_recebimento ? `'${data_recebimento}'::timestamptz` : 'NULL'})
      RETURNING id::text
    `)
    const purchaseId = purchaseRes[0]?.id
    if (!purchaseId) throw new Error('Falha ao criar purchase')

    // 3) Insere items
    for (const it of items) {
      const qty = Number(it.quantidade || 1)
      const custo = Number(it.custo_unitario || 0)
      const custoTotal = Number((qty * custo).toFixed(2))

      await prisma.$queryRawUnsafe(`
        INSERT INTO company_purchase_items
          (purchase_id, product_id, sku, nome_produto, quantidade, custo_unitario, custo_total)
        VALUES
          ('${purchaseId}'::uuid,
           ${it.product_id ? `'${it.product_id}'::uuid` : 'NULL'},
           ${it.sku ? `'${String(it.sku).replace(/'/g, "''").substring(0, 100)}'` : 'NULL'},
           ${it.nome_produto ? `'${String(it.nome_produto).replace(/'/g, "''").substring(0, 500)}'` : 'NULL'},
           ${qty}, ${custo}, ${custoTotal})
      `)

      // 4) Atualiza custo_fornecedor em product_prices (custo de aquisição do PARCEIRO)
      if (it.product_id && custo > 0) {
        await prisma.$queryRawUnsafe(`
          UPDATE product_prices
          SET custo_fornecedor = ${custo},
              fornecedor_company_id = ${fornecedor_company_id ? `'${fornecedor_company_id}'::uuid` : 'fornecedor_company_id'}
          WHERE product_id = '${it.product_id}'::uuid
            AND company_id = '${company_id}'::uuid
            AND canal = 'manual'
        `)
      }
    }

    // 5) Cria inter_company_sale (LIURA vê como "vendeu pro parceiro")
    if (fornecedor_company_id) {
      // Calcula custo_vendedor baseado no custo_fornecedor (LIURA) por produto
      let custoVendedor = 0
      for (const it of items) {
        if (it.product_id) {
          // Pega custo_fornecedor (do seller) pra esse produto
          const cpRes: any[] = await prisma.$queryRawUnsafe(`
            SELECT custo_fornecedor::text
            FROM product_prices
            WHERE product_id = '${it.product_id}'::uuid
              AND company_id = '${fornecedor_company_id}'::uuid
              AND canal IN ('mercado_livre', 'manual')
            ORDER BY CASE WHEN canal = 'mercado_livre' THEN 1 ELSE 2 END
            LIMIT 1
          `)
          const custo = cpRes[0]?.custo_fornecedor ? Number(cpRes[0].custo_fornecedor) : 0
          custoVendedor += custo * (Number(it.quantidade) || 1)
        } else {
          // Sem product_id: usa o custo_unitario informado como fallback
          // (se o item nao ta linkado, nao da pra saber o custo_fornecedor)
          custoVendedor += 0
        }
      }
      custoVendedor = Number(custoVendedor.toFixed(2))

      await prisma.$queryRawUnsafe(`
        INSERT INTO inter_company_sales
          (seller_company_id, buyer_company_id, total, custo_vendedor, lucro_vendedor)
        VALUES
          ('${fornecedor_company_id}'::uuid, '${company_id}'::uuid, ${total}, ${custoVendedor}, ${Number((total - custoVendedor).toFixed(2))})
      `)
    }

    return NextResponse.json({ ok: true, purchase_id: purchaseId, total, message: 'Compra registrada com sucesso' })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
