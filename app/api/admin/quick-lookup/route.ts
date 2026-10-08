import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const skuParam = url.searchParams.get('sku') || ''
    const orderId = url.searchParams.get('order') || ''

    const result: any = {}

    if (skuParam) {
      const skus = skuParam.split(',').map(s => s.trim()).filter(Boolean)
      const products = await prisma.products.findMany({
        where: { sku: { in: skus } },
        include: { product_prices: true },
      })
      result.custos = products.map(p => ({
        product_id: p.id,
        sku: p.sku,
        nome: p.nome,
        prices: p.product_prices.map(pp => ({
          price_id: pp.id,
          custo: pp.custo ? Number(pp.custo.toString()) : null,
          preco_venda: pp.preco_venda ? Number(pp.preco_venda.toString()) : null,
          canal: pp.canal,
        })),
      }))
    }

    if (orderId) {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId)
      const o = await prisma.orders.findFirst({
        where: {
          OR: [
            ...(isUuid ? [{ id: orderId }] : []),
            { order_number: orderId },
            { pack_id: orderId },
          ],
        },
      })
      if (o) {
        const dec = (d: any) => (d ? Number(d.toString()) : null)
        result.order = {
          id: o.id,
          order_number: o.order_number,
          pack_id: o.pack_id,
          total: dec(o.total),
          subtotal: dec(o.subtotal),
          frete: dec(o.frete),
          custo_total: dec(o.custo_total),
          lucro_bruto: dec(o.lucro_bruto),
          lucro_liquido: dec(o.lucro_liquido),
          comissao_seller_valor: dec(o.comissao_seller_valor),
          recebimento_liquido: dec(o.recebimento_liquido),
          tipo_envio: o.tipo_envio,
          custo_flex: dec(o.custo_flex),
          bonus_envio_valor: dec(o.bonus_envio_valor),
          bonus_cupom_valor: dec(o.bonus_cupom_valor),
          tarifa_pct_valor: dec(o.tarifa_pct_valor),
          tarifa_fixa_valor: dec(o.tarifa_fixa_valor),
          total_paid_amount: dec(o.total_paid_amount),
          origem: o.origem,
          status: o.status,
          created_at: o.created_at,
        }
        const items = await prisma.order_items.findMany({
          where: { order_id: o.id },
        })
        result.items = items.map(i => ({
          id: i.id,
          sku: i.sku,
          nome_produto: i.nome_produto,
          quantidade: i.quantidade,
          preco_unitario: dec(i.preco_unitario),
          preco_total: dec(i.preco_total),
          custo_unitario: dec(i.custo_unitario),
          product_id: i.product_id,
        }))
        // pega TODAS as orders do mesmo pack
        const packOrders = await prisma.orders.findMany({
          where: { pack_id: o.pack_id, id: { not: o.id } },
          include: { order_items: true },
        })
        result.pack_orders = packOrders.map(p => ({
          id: p.id,
          order_number: p.order_number,
          total: dec(p.total),
          items: p.order_items.map(i => ({
            sku: i.sku,
            nome_produto: i.nome_produto,
            preco_total: dec(i.preco_total),
          })),
        }))
      } else {
        result.order = null
      }
    }

    return NextResponse.json({ success: true, ...result })
  } catch (err: any) {
    console.error('[quick-lookup] ERROR:', err)
    return NextResponse.json({ success: false, error: err.message, stack: err.stack?.split('\n').slice(0, 5).join('\n') }, { status: 500 })
  }
}