/**
 * Retorna dados de envio COMPLETOS de pedidos (igual etiqueta ML)
 *
 * GET /api/admin/etiquetas/ml-data?ids=uuid1,uuid2
 *
 * Para cada pedido, busca:
 * - /orders/{id} → pack_id, shipping.id, buyer.id
 * - /shipments/{id} → tracking_number, tracking_method, receiver_address, logistic_type
 * - /users/{buyer_id} → nome completo do destinatário
 *
 * Cache: 5 min por pedido pra evitar refetch em loop
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getMLToken } from '@/lib/ml-auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

// Cache em memória (sobrevive enquanto a function rodar)
const cache = new Map<string, { ts: number; data: any }>()
const CACHE_TTL = 5 * 60 * 1000 // 5 min

async function fetchJson(url: string, token: string, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      if (r.status === 429) {
        await new Promise((res) => setTimeout(res, 800))
        continue
      }
      if (!r.ok) return null
      return await r.json()
    } catch {
      await new Promise((res) => setTimeout(res, 200))
    }
  }
  return null
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const idsParam = searchParams.get('ids') || ''
    const ids = idsParam.split(',').filter(Boolean)

    if (ids.length === 0) {
      return NextResponse.json({ ok: false, error: 'ids vazio' }, { status: 400 })
    }

    // Limita a 50 pedidos por chamada (pra caber no timeout)
    const limitedIds = ids.slice(0, 50)
    if (ids.length > 50) {
      console.log(`[ml-data] limitado a 50 de ${ids.length} pedidos`)
    }

    const orders = await prisma.orders.findMany({
      where: { id: { in: limitedIds } },
      select: {
        id: true,
        order_number: true,
        total: true,
        status: true,
        origem: true,
        marketplace_accounts: {
          select: { nickname: true, account_id: true },
        },
        order_items: {
          select: { id: true, sku: true, nome_produto: true, quantidade: true },
        },
      },
    })

    const tokenResult = await getMLToken()
    if (!tokenResult?.token) {
      return NextResponse.json({ ok: false, error: 'Token ML indisponível' }, { status: 500 })
    }
    const token = tokenResult.token

    // Pra cada pedido, busca dados de envio
    const result: any[] = []
    for (const o of orders) {
      const cacheKey = o.id
      const cached = cache.get(cacheKey)
      let data: any

      if (cached && Date.now() - cached.ts < CACHE_TTL) {
        data = cached.data
      } else {
        // 1) Detalhes da order (pack_id, shipping.id, buyer.id)
        const orderDetail = await fetchJson(
          `https://api.mercadolibre.com/orders/${o.order_number}?access_token=${token}`,
          token
        )

        if (!orderDetail) {
          // Order antiga não retorna mais do ML — usa o que tem
          data = {
            order_number: o.order_number,
            pack_id: null,
            shipping: null,
            buyer: null,
            fallback: true,
          }
        } else {
          // 2) Detalhes do shipment
          const shipId = orderDetail.shipping?.id
          let shipment: any = null
          if (shipId) {
            shipment = await fetchJson(
              `https://api.mercadolibre.com/shipments/${shipId}?access_token=${token}`,
              token
            )
          }

          // 3) Nome completo do buyer (se faltou)
          let buyerFull: any = null
          if (orderDetail.buyer?.id) {
            buyerFull = await fetchJson(
              `https://api.mercadolibre.com/users/${orderDetail.buyer.id}?access_token=${token}`,
              token
            )
          }

          data = {
            order_number: o.order_number,
            pack_id: orderDetail.pack_id,
            shipping: shipment
              ? {
                  id: shipment.id,
                  status: shipment.status,
                  tracking_number: shipment.tracking_number,
                  tracking_method: shipment.tracking_method,
                  tracking_url: shipment.tracking_url,
                  logistic_type: shipment.logistic_type,
                  shipping_mode: shipment.shipping_mode,
                  receiver_address: shipment.receiver_address,
                  sender_address: shipment.sender_address,
                }
              : null,
            buyer: {
              ...orderDetail.buyer,
              full_name: buyerFull
                ? `${buyerFull.first_name || ''} ${buyerFull.last_name || ''}`.trim()
                : orderDetail.buyer
                ? `${orderDetail.buyer.first_name || ''} ${orderDetail.buyer.last_name || ''}`.trim()
                : null,
            },
            fallback: false,
          }
        }
        cache.set(cacheKey, { ts: Date.now(), data })
      }

      result.push({
        id: o.id,
        order_number: o.order_number,
        total: Number(o.total || 0),
        status: o.status,
        origem: o.origem,
        envio_full: false, // TODO: pegar de marketplace_listings
        conta: o.marketplace_accounts?.nickname,
        // Endereço do remetente (vem do marketplace_accounts)
        remetente: o.marketplace_accounts
          ? {
              nickname: o.marketplace_accounts.nickname,
              account_id: o.marketplace_accounts.account_id,
            }
          : null,
        items: (o.order_items || []).map((it) => ({
          sku: it.sku,
          titulo: it.nome_produto,
          quantidade: it.quantidade,
        })),
        // Dados de envio do ML
        ml: data,
      })
    }

    return NextResponse.json({
      ok: true,
      total: result.length,
      pedidos: result,
    })
  } catch (err: any) {
    console.error('[ml-data]', err)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
