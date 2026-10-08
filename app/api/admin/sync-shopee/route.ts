import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { callShopeeAPI } from '@/lib/shopee-auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * GET/POST /api/admin/sync-shopee?company_id=X&days=7
 *
 * Puxa pedidos do Shopee Open Platform via /api/v2/order/get_order_list
 * e /api/v2/order/get_order_detail, salvando no DB em `orders` com
 * `canal_venda='shopee'`.
 *
 * Idempotente: checa `orders.marketplace_account_id` + `order_number` antes de criar.
 *
 * Returns: { ok, found_in_shopee, criados, erros, vendas_criadas }
 */
export async function GET(req: NextRequest) {
  return run(req)
}
export async function POST(req: NextRequest) {
  return run(req)
}

async function run(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const companyId = searchParams.get('company_id')
    const days = Math.max(1, Math.min(Number(searchParams.get('days') || 7), 30))

    if (!companyId) return NextResponse.json({ ok: false, error: 'company_id obrigatório' }, { status: 400 })

    // Calcula janela
    const endTime = Math.floor(Date.now() / 1000)
    const startTime = endTime - days * 24 * 60 * 60

    // 1) Pega a conta marketplace da Shopee
    const acc: any = await prisma.marketplace_accounts.findFirst({
      where: { company_id: companyId, plataforma: 'shopee' },
    })
    if (!acc) return NextResponse.json({ ok: false, error: 'Conta Shopee não vinculada' }, { status: 404 })

    // 2) Lista order_sn (cobre COMPLETED, PAID, SHIPPED, TO_CONFIRM_RECEIVE)
    const statusArr = ['UNPAID', 'READY_TO_SHIP', 'PROCESSED', 'SHIPPED', 'COMPLETED', 'IN_CANCEL', 'CANCELLED', 'TO_RETURN', 'TO_CONFIRM_RECEIVE']
    const orderSns: string[] = []
    const seen = new Set<string>()

    for (const status of statusArr) {
      let cursor = ''
      for (let i = 0; i < 5; i++) {
        const result = await callShopeeAPI<any>(companyId, '/api/v2/order/get_order_list', 'POST', {
          time_range_field: 'create_time',
          time_from: startTime,
          time_to: endTime,
          page_size: 100,
          cursor,
          order_status: status,
        })
        if (!result.ok) break
        const list = result.data?.response?.order_list || []
        for (const o of list) {
          if (!seen.has(o.order_sn)) {
            seen.add(o.order_sn)
            orderSns.push(o.order_sn)
          }
        }
        if (!result.data?.response?.more) break
        cursor = result.data.response.next_cursor
        if (!cursor) break
      }
    }

    if (orderSns.length === 0) {
      return NextResponse.json({ ok: true, found_in_shopee: 0, criados: 0, message: 'Nenhum pedido no período' })
    }

    // 3) Pra cada order_sn, pega detalhe e cria/atualiza no DB
    const criados: any[] = []
    const erros: any[] = []

    // Limite de segurança: 100 orders por chamada (timeout 60s)
    const batch = orderSns.slice(0, 100)
    for (const orderSn of batch) {
      try {
        const detail = await callShopeeAPI<any>(companyId, '/api/v2/order/get_order_detail', 'POST', {
          order_sn_list: [orderSn],
          response_optional_fields: ['buyer_user_id', 'buyer_username', 'recipient_address', 'actual_shipping_fee', 'goods_to_declare', 'note', 'item_list', 'pay_time', 'shipping_carrier', 'shipping_method', 'package_number', 'pickup_time', 'estimated_shipping_fee'],
        })
        if (!detail.ok) { erros.push({ order: orderSn, error: detail.error }); continue }
        const orderList = detail.data?.response?.order_list || []
        if (orderList.length === 0) continue
        const order = orderList[0]

        // Verifica se já existe
        const existing = await prisma.orders.findFirst({
          where: { order_number: orderSn, company_id: companyId },
        })
        if (existing) continue

        // Mapear status
        const statusMap: Record<string, string> = {
          UNPAID: 'pendente',
          READY_TO_SHIP: 'confirmado',
          PROCESSED: 'separado',
          SHIPPED: 'enviado',
          COMPLETED: 'entregue',
          IN_CANCEL: 'cancelado',
          CANCELLED: 'cancelado',
          TO_RETURN: 'devolvido',
          TO_CONFIRM_RECEIVE: 'enviado',
        }
        const status = statusMap[order.order_status] || 'confirmado'

        // Cria order
        const total = Number(order.total_amount || 0)
        const created = await prisma.orders.create({
          data: {
            order_number: orderSn,
            origem: 'shopee',
            company_id: companyId,
            marketplace_account_id: acc.id,
            status: status as any,
            total,
            subtotal: total,
            desconto: 0,
            frete: Number(order.actual_shipping_fee || 0),
            comissao_seller_pct: 0,
            comissao_seller_valor: 0,
            comissao_vendedora_pct: 0,
            comissao_vendedora_valor: 0,
            pago_em: order.pay_time ? new Date(order.pay_time * 1000) : new Date(order.create_time * 1000),
            created_at: new Date(order.create_time * 1000),
            updated_at: new Date(),
            // Shipment
            codigo_rastreio: order.package_number || null,
            transportadora: order.shipping_carrier || null,
            data_envio: order.ship_by_date ? new Date(order.ship_by_date * 1000) : null,
            data_entrega: order.complete_time ? new Date(order.complete_time * 1000) : null,
            previsao_entrega: null,
            // Endereço (JSON stringified)
            endereco_entrega: order.recipient_address ? JSON.stringify(order.recipient_address) : null,
            // Shopee extras
            tipo_envio: 'shopee',
          } as any,
        })

        // Cria items
        const items = order.item_list || []
        for (const item of items) {
          await prisma.order_items.create({
            data: {
              order_id: created.id,
              sku: String(item.item_id || item.model_id || ''),
              nome_produto: item.item_name || '',
              quantidade: Number(item.model_quantity_purchased || 1),
              preco_unitario: Number(item.model_discounted_price || 0),
              preco_total: Number(item.model_discounted_price || 0) * Number(item.model_quantity_purchased || 1),
              custo_unitario: 0,
              product_id: null,
            },
          })
        }

        criados.push({ order_sn: orderSn, total, status })
      } catch (e: any) {
        erros.push({ order: orderSn, error: e.message })
      }
      // Rate limit (Shopee: ~100 req/s)
      await new Promise(r => setTimeout(r, 100))
    }

    return NextResponse.json({
      ok: true,
      found_in_shopee: orderSns.length,
      processados: batch.length,
      criados: criados.length,
      vendas_criadas: criados,
      erros,
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message, stack: e.stack }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}
