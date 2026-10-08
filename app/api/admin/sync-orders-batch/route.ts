import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getMLToken } from '@/lib/ml-auth-multi'

async function mlApi(userId: number, token: string, path: string): Promise<any> {
  const r = await fetch(`https://api.mercadolibre.com${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!r.ok) {
    const txt = await r.text()
    throw new Error(`ML ${r.status}: ${txt.substring(0, 100)}`)
  }
  return r.json()
}

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // Vercel Hobby

/**
 * GET /api/admin/sync-orders-batch?ids=123,456,789&processExisting=false
 *
 * Recebe uma lista de order_ids (do compare-ml-vs-db) e processa cada um:
 * 1. Verifica se já existe no DB
 * 2. Se não, busca detalhe do ML + salva
 *
 * Processa em chunks com throttling pra evitar timeout.
 * Use ?processExisting=true pra reprocessar (refetch) vendas existentes.
 *
 * Returns: { received, already_in_db, processed, errors, error_samples }
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const idsParam = searchParams.get('ids') || ''
  const processExisting = searchParams.get('processExisting') === 'true'
  const maxBatch = Math.max(1, Math.min(Number(searchParams.get('max') || 30), 50))
  const accountIdParam = searchParams.get('account_id') // Opcional — se passado, usa essa conta

  if (!idsParam) {
    return NextResponse.json({ ok: false, error: 'Passe ?ids=1,2,3 (até 50 IDs por vez)' }, { status: 400 })
  }

  try {
    let acc: any
    if (accountIdParam) {
      acc = await prisma.marketplace_accounts.findUnique({ where: { id: accountIdParam } })
    } else {
      acc = await prisma.marketplace_accounts.findFirst({ where: { nickname: 'LIURAESSENCE' } })
    }
    if (!acc) return NextResponse.json({ ok: false, error: 'Conta ML não encontrada' }, { status: 404 })

    const companyId = acc.company_id || ''
    const userId = Number(acc.account_id)
    const tokenRes = await getMLToken(companyId)
    if (!tokenRes?.token) return NextResponse.json({ ok: false, error: 'Token ML indisponível' }, { status: 401 })
    const token = tokenRes.token

    const allIds = idsParam.split(',').map(s => s.trim()).filter(Boolean)
    const ids = allIds.slice(0, maxBatch)
    const hasMore = allIds.length > maxBatch
    const nextIds = hasMore ? allIds.slice(maxBatch).join(',') : null

    // Check existing in DB
    const existing = await prisma.orders.findMany({
      where: { order_number: { in: ids } },
      select: { order_number: true, status: true, total: true },
    })
    const existingSet = new Set(existing.map(o => String(o.order_number)))
    const missing = ids.filter(id => !existingSet.has(id) || processExisting)

    console.log(`[sync-orders-batch] Recebidos: ${ids.length} | Já no DB: ${existingSet.size} | Processar: ${missing.length} | processExisting: ${processExisting}`)

    let processed = 0
    const errorSamples: string[] = []
    const createdSamples: string[] = []
    const updatedSamples: string[] = []

    for (let i = 0; i < missing.length; i++) {
      const orderId = missing[i]
      try {
        // 1) Buscar detalhe do pedido
        const detail: any = await mlApi(userId, token, `/orders/${orderId}`)
        if (!detail || !detail.id) {
          errorSamples.push(`${orderId}: detail vazio`)
          continue
        }

        // 2) Buscar shipment detail (pra frete, bonus_envio, cupom)
        let shipmentDetail: any = null
        try {
          if (detail.shipping?.id) {
            shipmentDetail = await mlApi(userId, token, `/shipments/${detail.shipping.id}`)
          }
        } catch {}

        // 3) Buscar costs do shipment (pra frete correto)
        let senderCost = 0
        let bonusEnvio = 0
        let logisticType = 'self_service'
        try {
          if (detail.shipping?.id) {
            const costs: any = await mlApi(userId, token, `/shipments/${detail.shipping.id}/costs`)
            if (costs?.senders?.[0]) {
              senderCost = Number(costs.senders[0].cost || 0)
            }
          }
        } catch {}
        if (shipmentDetail) {
          logisticType = shipmentDetail.logistic_type || 'self_service'
          const baseCost = Number(shipmentDetail.base_cost || 0)
          const listCost = Number(shipmentDetail.shipping_option?.list_cost || 0)
          const senderSave = Number(shipmentDetail.sender_save || 0)
          const receiverSave = Number(shipmentDetail.receiver_save || 0)
          bonusEnvio = Math.max(baseCost - listCost, senderSave, receiverSave)
        }

        // 4) Calcular comissão via order_items
        let comissaoTotal = 0
        let tarifaCheiaTotal = 0
        const items = detail.order_items || []
        for (const item of items) {
          const precoUnitario = Number(item.unit_price || 0)
          const qtd = Number(item.quantity || 1)
          const saleFeeUnit = Number(item.sale_fee || 0)
          comissaoTotal += saleFeeUnit * qtd
          tarifaCheiaTotal += precoUnitario * qtd * 0.12
        }

        // 5) Bonus cupom (implícito + explícito)
        let bonusCupom = 0
        if (Array.isArray(detail.payments)) {
          for (const p of detail.payments) {
            if (p.coupon_amount && Number(p.coupon_amount) > 0) {
              bonusCupom += Number(p.coupon_amount)
            }
          }
        }
        const tags = detail.tags || []
        if (Array.isArray(tags) && tags.includes('order_has_discount')) {
          const bonusImplicito = Math.max(0, tarifaCheiaTotal - comissaoTotal)
          if (bonusImplicito > bonusCupom) bonusCupom = bonusImplicito
        }

        // 6) Recebimento
        const totalAmount = Number(detail.total_amount || 0)
        const recebimento = Math.max(0, totalAmount - comissaoTotal - senderCost + bonusEnvio)

        // 7) Status
        const statusMap: Record<string, any> = {
          paid: 'confirmado',
          handling: 'separado',
          ready_to_ship: 'separado',
          shipped: 'enviado',
          delivered: 'entregue',
          cancelled: 'cancelado',
        }
        const statusInterno = statusMap[detail.status || 'paid'] || 'confirmado'

        // 8) UPSERT
        const data: any = {
          order_number: String(detail.id),
          pack_id: detail.pack_id ? String(detail.pack_id) : null,
          origem: 'mercado_livre',
          company_id: companyId,
          marketplace_account_id: acc.id,
          status: statusInterno,
          subtotal: totalAmount, // ML não separa subtotal; usa total como proxy
          total: totalAmount,
          comissao_seller_pct: 12,
          comissao_seller_valor: comissaoTotal,
          // 🔑 CORREÇÃO: gravar tarifa_pct_valor (= 12% do total) e tarifa_fixa_valor (custo fixo ML)
          // Sem isso, o painel mostra comissão errada (1% em vez de 12%)
          tarifa_pct_valor: Math.round(totalAmount * 0.12 * 100) / 100,
          tarifa_fixa_valor: Math.max(0, Math.round((comissaoTotal + bonusCupom - totalAmount * 0.12) * 100) / 100),
          frete: senderCost,
          bonus_envio_valor: bonusEnvio,
          bonus_cupom_valor: bonusCupom,
          recebimento_liquido: recebimento,
          tipo_envio: logisticType,
          payment_id: String(detail.id),
          pago_em: new Date(detail.date_created || Date.now()),
          updated_at: new Date(),
          // IMPORTANTE: created_at = data real da venda (date_created do ML),
          // NAO a data do sync. Sem isso, todas as vendas ficam com created_at = NOW()
          // e os filtros de janela (7d, 30d, etc) nao funcionam direito.
          ...(existingSet.has(String(detail.id)) ? {} : { created_at: new Date(detail.date_created || Date.now()) }),
        }

        await prisma.orders.upsert({
          where: { order_number: String(detail.id) },
          create: data,
          update: data,
        })

        // 8b) VINCULAR ORDER_ITEMS — sem isso, vendas sem items não têm custo calculado
        // Lookup de product_id por listing_id e custo por product_id
        const mlItemIds = (detail.order_items || []).map((it: any) => it.item?.id).filter(Boolean)
        const listingsForItems = mlItemIds.length > 0
          ? await prisma.marketplace_listings.findMany({
              where: { listing_id: { in: mlItemIds.map(String) } },
              select: { listing_id: true, product_id: true },
            })
          : []
        const listingMap = new Map(listingsForItems.map(l => [String(l.listing_id), l.product_id]))
        const productIds = Array.from(new Set(listingsForItems.map(l => l.product_id).filter(Boolean)))
        const productCosts = productIds.length > 0
          ? await prisma.product_prices.findMany({
              where: { product_id: { in: productIds }, canal: { in: ['mercado_livre', 'manual'] } },
              select: { product_id: true, custo: true },
            })
          : []
        const costMap = new Map(productCosts.map(p => [p.product_id, p.custo ? Number(p.custo.toString()) : null]))

        // Pega o order_id (pra criar items vinculados)
        const dbOrder = await prisma.orders.findUnique({
          where: { order_number: String(detail.id) },
          select: { id: true },
        })
        if (dbOrder) {
          // Verifica se já tem items (não duplica se já tiver)
          const existingItems = await prisma.order_items.findMany({
            where: { order_id: dbOrder.id },
            select: { id: true },
          })
          if (existingItems.length === 0) {
            for (const item of (detail.order_items || [])) {
              const productId = listingMap.get(String(item.item?.id)) || null
              const custoReal = productId ? costMap.get(productId) : null
              const precoUnit = Number(item.unit_price || 0)
              const qtd = Number(item.quantity || 1)
              await prisma.order_items.create({
                data: {
                  order_id: dbOrder.id,
                  product_id: productId,
                  sku: item.item?.seller_custom_field || item.item?.id || null,
                  nome_produto: item.item?.title || null,
                  foto_url: item.item?.thumbnail || null,
                  quantidade: qtd,
                  preco_unitario: precoUnit,
                  preco_total: precoUnit * qtd,
                  custo_unitario: custoReal != null && custoReal > 0
                    ? Math.round(custoReal * 100) / 100
                    : null,
                },
              })
            }
          }
        }

        processed++
        if (existingSet.has(String(detail.id))) {
          if (updatedSamples.length < 5) updatedSamples.push(`${orderId} R$ ${totalAmount}`)
        } else {
          if (createdSamples.length < 5) createdSamples.push(`${orderId} R$ ${totalAmount}`)
        }

        // Throttle
        if (i > 0 && i % 5 === 0) {
          await new Promise(r => setTimeout(r, 200))
        }
      } catch (e: any) {
        const msg = (e.message || String(e)).substring(0, 2500)
        console.log(`[sync-orders-batch] ERRO ${orderId}: ${msg}`)
        errorSamples.push(`${orderId}: ${msg}`)
      }
    }

    return NextResponse.json({
      ok: true,
      received: ids.length,
      has_more: hasMore,
      next_ids: nextIds,
      already_in_db: existingSet.size,
      processed,
      errors: errorSamples.length,
      rate_limited: errorSamples.some((s: string) => s.includes('rate') || s.includes('429')),
      created_samples: createdSamples,
      updated_samples: updatedSamples,
      error_samples: errorSamples.slice(0, 10),
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message, stack: e.stack }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}
