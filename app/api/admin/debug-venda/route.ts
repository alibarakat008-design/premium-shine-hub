/**
 * GET /api/admin/debug-venda?order=X
 *
 * Debug detalhado de uma venda — vê custo_unitario, custo_total, CMV, etc.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const orderNumber = searchParams.get('order')
  if (!orderNumber) {
    return NextResponse.json({ ok: false, error: 'order obrigatório' }, { status: 400 })
  }

  try {
    const order: any[] = await prisma.$queryRawUnsafe(`
      SELECT o.id::text, o.order_number, o.total::float AS total, o.recebimento_liquido::float AS recebimento,
             o.comissao_seller_valor::float AS comissao, o.frete::float AS frete,
             o.custo_flex::float AS custo_flex, o.tipo_envio,
             o.status::text, o.created_at, o.company_id::text AS company_id,
             c.nome_fantasia AS company
      FROM orders o LEFT JOIN companies c ON c.id = o.company_id
      WHERE o.order_number = $1 LIMIT 1
    `, orderNumber)

    if (order.length === 0) {
      return NextResponse.json({ ok: false, error: 'Venda não encontrada' }, { status: 404 })
    }
    const o = order[0]

    const items: any[] = await prisma.$queryRawUnsafe(`
      SELECT oi.id::text, oi.sku, oi.nome_produto, oi.quantidade,
             oi.preco_unitario::float AS preco_unitario,
             oi.preco_total::float AS preco_total,
             oi.custo_unitario::float AS custo_unitario,
             (oi.custo_unitario * oi.quantidade)::float AS custo_total_item,
             oi.product_id::text AS product_id,
             p.marca_id::text AS marca_id, b.nome AS marca,
             pp.custo::float AS custo_cadastrado
      FROM order_items oi
      LEFT JOIN products p ON p.id = oi.product_id
      LEFT JOIN brands b ON b.id = p.marca_id
      LEFT JOIN product_prices pp ON pp.product_id = oi.product_id
        AND pp.company_id = $2::uuid
      WHERE oi.order_id = $1::uuid
    `, o.id, o.company_id)

    const cmvProdutos = items.reduce((acc, it) => acc + (Number(it.custo_total_item) || 0), 0)
    const cmvFlex = Number(o.custo_flex) || 0
    const cmvTotal = cmvProdutos + cmvFlex
    const lucro = Number(o.recebimento) - cmvTotal
    const margem = Number(o.total) > 0 ? (lucro / Number(o.total)) * 100 : 0

    return NextResponse.json({
      ok: true,
      order: {
        order_number: o.order_number,
        company: o.company,
        total: Number(o.total),
        recebimento: Number(o.recebimento),
        comissao: Number(o.comissao),
        frete: Number(o.frete),
        custo_flex: cmvFlex,
        tipo_envio: o.tipo_envio,
        status: o.status,
        created_at: o.created_at,
      },
      items: items.map(it => ({
        sku: it.sku,
        nome: it.nome_produto,
        marca: it.marca,
        quantidade: Number(it.quantidade),
        preco_unitario: Number(it.preco_unitario),
        preco_total: Number(it.preco_total),
        custo_unitario: Number(it.custo_unitario),
        custo_total_item: Number(it.custo_total_item),
        custo_cadastrado_no_db: it.custo_cadastrado != null ? Number(it.custo_cadastrado) : null,
        // Diagnóstico: é estimativa 55% ou custo real?
        // Se custo_unitario ≈ preco_unitario * 0.55 → estimativa
        estimativa_55_pct: Number(it.preco_unitario) * 0.55,
        diferenca: it.custo_cadastrado != null
          ? Math.abs(Number(it.custo_unitario) - Number(it.custo_cadastrado))
          : null,
      })),
      cmv: {
        produtos: cmvProdutos,
        flex: cmvFlex,
        total: cmvTotal,
      },
      lucro,
      margem_pct: Math.round(margem * 100) / 100,
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}