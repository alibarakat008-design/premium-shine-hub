/**
 * Backfill ML COMPLETO: paginação direta + processa inline
 *
 * GET /api/admin/backfill-fast?account_id=X&startDate=2026-03-17&endDate=2026-07-17&parallel=4
 *
 * Otimizado: faz paginação do ML e processa vendas em PARALELO
 * (não repassa pra /sync-orders-batch, processa inline com Promise.all)
 *
 * Retorna quando termina OU quando timeout (maxDuration=300s)
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getMLToken } from '@/lib/ml-auth-multi'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

async function mlApi(token: string, path: string): Promise<any> {
  const r = await fetch(`https://api.mercadolibre.com${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!r.ok) {
    const txt = await r.text()
    throw new Error(`ML ${r.status}: ${txt.substring(0, 100)}`)
  }
  return r.json()
}

async function processOrder(
  orderId: string,
  companyId: string,
  accountDbId: string,
  token: string,
): Promise<{ created: boolean; updated: boolean; error?: string }> {
  try {
    // Detalhe do pedido
    const detail: any = await mlApi(token, `/orders/${orderId}`)
    if (!detail || !detail.id) return { created: false, updated: false, error: 'detail vazio' }

    // Shipment detail
    let shipmentDetail: any = null
    try {
      if (detail.shipping?.id) {
        shipmentDetail = await mlApi(token, `/shipments/${detail.shipping.id}`)
      }
    } catch {}

    // Costs do shipment
    let senderCost = 0
    let bonusEnvio = 0
    let logisticType = 'self_service'
    try {
      if (detail.shipping?.id) {
        const costs: any = await mlApi(token, `/shipments/${detail.shipping.id}/costs`)
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

    // Comissão
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

    // Bonus cupom
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

    // Recebimento
    const totalAmount = Number(detail.total_amount || 0)
    const recebimento = Math.max(0, totalAmount - comissaoTotal - senderCost + bonusEnvio)

    // Status
    const statusMap: Record<string, any> = {
      paid: 'confirmado',
      handling: 'separado',
      ready_to_ship: 'separado',
      shipped: 'enviado',
      delivered: 'entregue',
      cancelled: 'cancelado',
    }
    const statusInterno = statusMap[detail.status || 'paid'] || 'confirmado'

    // Verifica se já existe (pra saber se cria ou atualiza)
    const existing = await prisma.orders.findUnique({
      where: { order_number: String(detail.id) },
      select: { order_number: true },
    })

    // UPSERT
    const data: any = {
      order_number: String(detail.id),
      pack_id: detail.pack_id ? String(detail.pack_id) : null,
      origem: 'mercado_livre',
      company_id: companyId,
      marketplace_account_id: accountDbId,
      status: statusInterno,
      subtotal: totalAmount,
      total: totalAmount,
      comissao_seller_pct: 12,
      comissao_seller_valor: comissaoTotal,
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
      ...(existing ? {} : { created_at: new Date(detail.date_created || Date.now()) }),
    }
    await prisma.orders.upsert({
      where: { order_number: String(detail.id) },
      create: data,
      update: data,
    })

    // Vincula order_items
    const mlItemIds = (detail.order_items || []).map((it: any) => it.item?.id).filter(Boolean)
    if (mlItemIds.length > 0) {
      const listingsForItems = await prisma.marketplace_listings.findMany({
        where: {
          listing_id: { in: mlItemIds.map(String) },
          account_id: accountDbId,
        },
        select: { listing_id: true, product_id: true },
      })
      const listingToProduct = new Map<string, string>()
      for (const l of listingsForItems) {
        if (l.product_id) listingToProduct.set(String(l.listing_id), l.product_id)
      }
      for (const item of items) {
        const mlItemId = item.item?.id
        if (!mlItemId) continue
        const productId = listingToProduct.get(String(mlItemId))
        if (!productId) continue
        const unitPrice = Number(item.unit_price || 0)
        const qtd = Number(item.quantity || 1)
        await prisma.order_items.upsert({
          where: { order_number_item_id: { order_number: String(detail.id), item_id: String(mlItemId) } } as any,
          create: {
            order_number: String(detail.id),
            item_id: String(mlItemId),
            product_id: productId,
            sku: String(mlItemId),
            title: item.item?.title || '',
            unit_price: unitPrice,
            quantity: qtd,
            custo_unitario: null,
            company_id: companyId,
            created_at: new Date(detail.date_created || Date.now()),
          } as any,
          update: {
            product_id: productId,
            unit_price: unitPrice,
            quantity: qtd,
          } as any,
        })
      }
    }

    return { created: !existing, updated: !!existing, error: undefined }
  } catch (e: any) {
    return { created: false, updated: false, error: e.message?.substring(0, 100) }
  }
}

export async function GET(req: NextRequest) {
  const t0 = Date.now()
  const { searchParams } = new URL(req.url)
  const accountId = searchParams.get('account_id')
  const startDateParam = searchParams.get('startDate')
  const endDateParam = searchParams.get('endDate') || new Date().toISOString()
  const days = Math.max(1, Math.min(Number(searchParams.get('days') || 365), 730))
  const parallel = Math.max(1, Math.min(Number(searchParams.get('parallel') || 5), 10))
  const maxOrders = Math.max(1, Math.min(Number(searchParams.get('maxOrders') || 5000), 20000))

  if (!accountId) {
    return NextResponse.json({ ok: false, error: 'account_id obrigatorio' }, { status: 400 })
  }

  const acc: any = await prisma.marketplace_accounts.findUnique({ where: { id: accountId } })
  if (!acc) return NextResponse.json({ ok: false, error: 'Conta nao encontrada' }, { status: 404 })

  const tokenRes = await getMLToken(acc.company_id)
  if (!tokenRes?.token) return NextResponse.json({ ok: false, error: 'Sem token' }, { status: 401 })
  const token = tokenRes.token

  const dateTo = endDateParam
  const dateFrom = startDateParam || new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  try {
    console.log('[backfill-fast] ' + acc.nickname + ' de=' + dateFrom + ' ate=' + dateTo + ' parallel=' + parallel)

    // 1) Paginação completa do ML
    const allIds: string[] = []
    let offset = 0
    const pageSize = 50
    let rateLimitHits = 0

    while (true) {
      const url = `https://api.mercadolibre.com/orders/search?seller=${acc.account_id}&order.date_created.from=${dateFrom}&order.date_created.to=${dateTo}&limit=${pageSize}&offset=${offset}&sort=date_desc`
      const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })

      if (r.status === 429) {
        rateLimitHits++
        if (rateLimitHits > 5) {
          return NextResponse.json({ ok: false, error: 'Rate limit excessivo', rateLimitHits }, { status: 429 })
        }
        await new Promise(r => setTimeout(r, 60000))
        continue
      }
      if (!r.ok) {
        return NextResponse.json({ ok: false, error: `ML ${r.status}` }, { status: 502 })
      }
      const j = await r.json()
      const results = j.results || []
      if (results.length === 0) break
      allIds.push(...results.map((o: any) => String(o.id)))
      if (results.length < pageSize) break
      offset += pageSize
      if (allIds.length > maxOrders) break
      await new Promise(r => setTimeout(r, 80))
    }

    console.log('[backfill-fast] IDs: ' + allIds.length + ' rate_limit=' + rateLimitHits)

    // 2) Filtra os que faltam
    const exist: any[] = await prisma.$queryRawUnsafe(`
      SELECT order_number::text as order_number
      FROM orders WHERE order_number = ANY($1::text[])
    `, allIds)
    const existingSet = new Set(exist.map((e: any) => e.order_number))
    const newIds = allIds.filter(id => !existingSet.has(id))
    console.log('[backfill-fast] Já no DB: ' + existingSet.size + ' | Faltam: ' + newIds.length)

    if (newIds.length === 0) {
      return NextResponse.json({
        ok: true,
        message: 'Nada novo pra processar',
        ml_total: allIds.length,
        novos: 0,
        criados: 0,
        atualizados: 0,
        rateLimitHits,
        duracao_ms: Date.now() - t0,
      })
    }

    // 3) Processa em PARALELO
    let criados = 0
    let atualizados = 0
    let errors = 0
    let processed = 0
    const errorSamples: string[] = []
    const startProcess = Date.now()

    // Processa em chunks de "parallel" vendas
    for (let i = 0; i < newIds.length; i += parallel) {
      const chunk = newIds.slice(i, i + parallel)
      const results = await Promise.all(
        chunk.map(id => processOrder(id, acc.company_id, acc.id, token))
      )
      for (const r of results) {
        processed++
        if (r.error) {
          errors++
          if (errorSamples.length < 10) errorSamples.push(r.error)
        } else if (r.created) {
          criados++
        } else if (r.updated) {
          atualizados++
        }
      }

      if (i % (parallel * 10) === 0) {
        const elapsed = ((Date.now() - startProcess) / 1000).toFixed(1)
        console.log(`[backfill-fast] ${processed}/${newIds.length} (${elapsed}s) criados=${criados} atualizados=${atualizados} erros=${errors}`)
      }

      // Para se passou do tempo
      if (Date.now() - t0 > 280000) {
        console.log('[backfill-fast] Tempo limite atingido')
        break
      }
    }

    return NextResponse.json({
      ok: true,
      account_id: accountId,
      account_nickname: acc.nickname,
      company_id: acc.company_id,
      ml_total: allIds.length,
      ja_existiam: existingSet.size,
      novos: newIds.length,
      processados: processed,
      criados,
      atualizados,
      erros: errors,
      error_samples: errorSamples,
      rateLimitHits,
      duracao_ms: Date.now() - t0,
      message: errors === 0
        ? `✅ ${criados} criados, ${atualizados} atualizados em ${((Date.now() - t0) / 1000).toFixed(1)}s`
        : `⚠️ ${errors} erros. ${errorSamples.slice(0, 3).join(' | ')}`,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}
