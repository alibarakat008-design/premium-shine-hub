/**
 * Geração de etiquetas em LOTE (otimizada)
 *
 * - Cache de 5 min por pedido (reutiliza dados ML)
 * - Paralelismo de 5 (vs 3 anterior)
 * - Suporta até 200 pedidos de uma vez
 * - Retorna progresso em tempo real
 *
 * GET /api/admin/etiquetas/gerar-lote?ids=uuid1,uuid2&formato=ml&por_pagina=1
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getMLToken } from '@/lib/ml-auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

// Cache de 5 min por pedido (sobrevive durante a request)
const cache = new Map<string, { ts: number; data: any }>()
const CACHE_TTL = 5 * 60 * 1000

async function fetchJson(url: string, token: string, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      if (r.status === 429) {
        await new Promise((res) => setTimeout(res, 600))
        continue
      }
      if (!r.ok) return null
      return await r.json()
    } catch {
      await new Promise((res) => setTimeout(res, 150))
    }
  }
  return null
}

async function carregarPedidos(orders: any[], token: string) {
  const enriched = []
  // Processa em paralelo (5 simultâneos — antes era 3)
  const BATCH = 5
  for (let i = 0; i < orders.length; i += BATCH) {
    const slice = orders.slice(i, i + BATCH)
    const results = await Promise.all(
      slice.map(async (o) => {
        const cacheKey = o.id
        const cached = cache.get(cacheKey)
        let data: any

        if (cached && Date.now() - cached.ts < CACHE_TTL) {
          data = cached.data
        } else {
          // Fetch /orders/{id} + /shipments/{id} + /users/{id} em paralelo
          const orderDetail = await fetchJson(
            `https://api.mercadolibre.com/orders/${o.order_number}?access_token=${token}`,
            token
          )

          if (!orderDetail) {
            data = { fallback: true }
          } else {
            const shipId = orderDetail.shipping?.id
            const buyerId = orderDetail.buyer?.id

            const [shipment, buyerFull] = await Promise.all([
              shipId
                ? fetchJson(
                    `https://api.mercadolibre.com/shipments/${shipId}?access_token=${token}`,
                    token
                  )
                : Promise.resolve(null),
              buyerId
                ? fetchJson(
                    `https://api.mercadolibre.com/users/${buyerId}?access_token=${token}`,
                    token
                  )
                : Promise.resolve(null),
            ])

            const logisticType = shipment?.logistic_type || ''
            const tmethod = (shipment?.tracking_method || '').toUpperCase()
            const destinatario =
              shipment?.receiver_address?.receiver_name ||
              (buyerFull ? `${buyerFull.first_name || ''} ${buyerFull.last_name || ''}`.trim() : '') ||
              orderDetail.buyer?.nickname ||
              'Destinatário'

            data = {
              fallback: false,
              pack_id: orderDetail.pack_id,
              shipping_id: orderDetail.shipping?.id,
              shipping: shipment
                ? {
                    id: shipment.id,
                    tracking_number: shipment.tracking_number,
                    tracking_method: shipment.tracking_method,
                    tracking_url: shipment.tracking_url,
                    logistic_type: shipment.logistic_type,
                    status: shipment.status,
                    receiver_address: shipment.receiver_address,
                    sender_address: shipment.sender_address,
                  }
                : null,
              buyer: {
                id: orderDetail.buyer?.id,
                nickname: orderDetail.buyer?.nickname,
                first_name: orderDetail.buyer?.first_name,
                last_name: orderDetail.buyer?.last_name,
                full_name: destinatario,
                doc_number: buyerFull?.identification?.number || null,
              },
            }
          }
          cache.set(cacheKey, { ts: Date.now(), data })
        }

        return { ...o, ml: data }
      })
    )
    enriched.push(...results)
  }
  return enriched
}

export async function GET(req: NextRequest) {
  const t0 = Date.now()
  try {
    const { searchParams } = new URL(req.url)
    const idsParam = searchParams.get('ids') || ''
    const formato = searchParams.get('formato') || 'ml'
    const porPagina = parseInt(searchParams.get('por_pagina') || '1', 10)

    if (!idsParam) {
      return NextResponse.json({ ok: false, error: 'ids vazio' }, { status: 400 })
    }

    const ids = idsParam.split(',').filter(Boolean)
    if (ids.length === 0) {
      return NextResponse.json({ ok: false, error: 'IDs inválidos' }, { status: 400 })
    }

    if (ids.length > 200) {
      return NextResponse.json(
        { ok: false, error: 'Limite de 200 etiquetas por chamada' },
        { status: 400 }
      )
    }

    // Cache só funciona pra ML (picking não precisa)
    if (formato !== 'ml') {
      return NextResponse.json({
        ok: true,
        redirect: `/api/admin/etiquetas/html?ids=${ids.join(',')}&formato=${formato}&por_pagina=${porPagina}`,
      })
    }

    const orders = await prisma.orders.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        order_number: true,
        total: true,
        origem: true,
        created_at: true,
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

    const enriched = await carregarPedidos(orders, tokenResult.token)

    // Renderiza usando a mesma lógica do /html
    const enrichedComRemetente = enriched.map((o) => ({
      ...o,
      conta: o.marketplace_accounts?.nickname,
      remetente: o.marketplace_accounts
        ? {
            nickname: o.marketplace_accounts.nickname,
            account_id: o.marketplace_accounts.account_id,
          }
        : null,
      items: o.order_items || [],
    }))

    // Retorna os dados enriquecidos + URL para o HTML endpoint
    return NextResponse.json({
      ok: true,
      total: enriched.length,
      tempo_ms: Date.now() - t0,
      cache_usado: enriched.filter((_, i) => cache.has(orders[i]?.id || '')).length,
      enriquecidos: enrichedComRemetente,
      proximo_passo: 'Use os dados em /api/admin/etiquetas/html',
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
