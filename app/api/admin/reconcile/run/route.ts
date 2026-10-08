import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Diferença mínima (em R$) pra considerar discrepância
const DEFAULT_THRESHOLD = 0.5
// Rate limit entre ordens
const REQUEST_DELAY_MS = 250

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function getMLToken() {
  const acc = await prisma.marketplace_accounts.findFirst({
    where: { plataforma: 'mercado_livre', ativa: true },
    orderBy: { updated_at: 'desc' },
  })
  return acc?.access_token
}

export async function POST(req: Request) {
  const startTime = Date.now()
  try {
    const body = await req.json().catch(() => ({}))
    const days = Number(body.days) || 7
    const onlyFlex = body.onlyFlex === true
    const onlyFull = body.onlyFull === true
    const onlyDiscrepancy = body.onlyDiscrepancy !== false // default true
    const threshold = Number(body.threshold) || DEFAULT_THRESHOLD
    const batchSize = Number(body.batchSize) || 30
    const resetPrior = body.resetPrior === true

    const token = await getMLToken()
    if (!token) return NextResponse.json({ ok: false, error: 'no ML token' }, { status: 500 })

    // 1) pegar orders recentes
    const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    const where: any = {
      created_at: { gte: sinceDate },
      origem: 'mercado_livre',
      order_number: { not: null },
    }
    if (onlyFlex) where.tipo_envio = 'self_service'
    if (onlyFull) where.tipo_envio = 'fulfillment'

    const orders = await prisma.orders.findMany({
      where,
      orderBy: { created_at: 'desc' },
      take: batchSize,
      include: { order_items: true },
    })

    // limpa resultados pendentes anteriores (somente se resetPrior)
    if (resetPrior) {
      await prisma.$executeRawUnsafe(
        `UPDATE reconciliation_results SET status='stale', resolved_at=NOW() WHERE status='pending'`,
      )
    }

    const results: any[] = []
    let processed = 0
    let discrepancies = 0
    const errors: any[] = []

    for (const o of orders) {
      if (!o.order_number) continue
      try {
        const dec = (d: any) => (d ? Number(d.toString()) : 0)

        // 2) chama ML /orders/{id}
        const mlResp = await fetch(`https://api.mercadolibre.com/orders/${o.order_number}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!mlResp.ok) {
          if (mlResp.status === 404) {
            // venda não existe mais? pula
            processed++
            continue
          }
          errors.push({ order: o.order_number, error: `ML orders ${mlResp.status}` })
          continue
        }
        const mlOrder: any = await mlResp.json()

        // 3) chama ML /shipments/{id}/costs
        let shipCosts: any = { receiver: {}, senders: [{}] }
        let logisticType = o.tipo_envio || null
        if (mlOrder.shipping?.id) {
          try {
            const cResp = await fetch(
              `https://api.mercadolibre.com/shipments/${mlOrder.shipping.id}/costs`,
              { headers: { Authorization: `Bearer ${token}` } },
            )
            if (cResp.ok) shipCosts = await cResp.json()
            // também o shipment pra detectar logistic_type
            const sResp = await fetch(
              `https://api.mercadolibre.com/shipments/${mlOrder.shipping.id}`,
              { headers: { Authorization: `Bearer ${token}` } },
            )
            if (sResp.ok) {
              const shipment: any = await sResp.json()
              logisticType = shipment.logistic_type || logisticType
            }
          } catch {}
        }

        const saleFee = mlOrder.sale_fee ? Number(mlOrder.sale_fee.toString ? mlOrder.sale_fee.toString() : mlOrder.sale_fee) : 0
        const mlVenda = mlOrder.total_amount ? Number(mlOrder.total_amount.toString ? mlOrder.total_amount.toString() : mlOrder.total_amount) : dec(o.total)
        const subtotal = dec(o.subtotal) // do DB
        const senderCost = shipCosts?.senders?.[0]?.cost ? Number(shipCosts.senders[0].cost.toString ? shipCosts.senders[0].cost.toString() : shipCosts.senders[0].cost) : 0
        const senderSave = shipCosts?.senders?.[0]?.save ? Number(shipCosts.senders[0].save.toString ? shipCosts.senders[0].save.toString() : shipCosts.senders[0].save) : 0
        const receiverSave = shipCosts?.receiver?.save ? Number(shipCosts.receiver.save.toString ? shipCosts.receiver.save.toString() : shipCosts.receiver.save) : 0

        // 4) calcular receb esperado por tipo
        // FLEX: subtotal - comissao + max(sender_save, receiver_save)
        //      (carrier é pago à parte pelo vendedor, então usa subtotal = venda - frete)
        // FULL/Cross_docking/Clássico: venda - comissao - frete + receiver_save + sender_save
        let mlReceb = 0
        if (logisticType === 'self_service') {
          mlReceb = subtotal - saleFee + Math.max(senderSave, receiverSave)
        } else {
          // FULL: ML desconta frete (sender.cost é o frete da logística)
          // cross_docking: Buyer pagou frete — receiver.save é o cupom ML devolve
          mlReceb = mlVenda - saleFee - (logisticType === 'fulfillment' ? senderCost : 0) + senderSave + receiverSave
        }
        mlReceb = Number(mlReceb.toFixed(2))

        const dbReceb = dec(o.recebimento_liquido)
        const diff = Number((mlReceb - dbReceb).toFixed(2))

        // 5) salva no DB
        await prisma.$executeRawUnsafe(
          `INSERT INTO reconciliation_results (order_id, order_number, pack_id, tipo_envio, ml_receb, db_receb, diff, ml_sale_fee, ml_receiver_save, ml_sender_save, ml_sender_cost, ml_venda)
           VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          o.id,
          o.order_number,
          o.pack_id,
          logisticType,
          mlReceb,
          dbReceb,
          diff,
          saleFee,
          receiverSave,
          senderSave,
          senderCost,
          mlVenda,
        )

        const item: any = {
          order_number: o.order_number,
          pack_id: o.pack_id,
          tipo_envio: logisticType,
          ml_receb: mlReceb,
          db_receb: dbReceb,
          diff,
          ml_venda: mlVenda,
          ml_sale_fee: saleFee,
          ml_receiver_save: receiverSave,
          ml_sender_save: senderSave,
          ml_sender_cost: senderCost,
        }
        if (Math.abs(diff) > threshold) {
          discrepancies++
          if (onlyDiscrepancy) results.push(item)
        } else {
          if (!onlyDiscrepancy) results.push(item)
        }
        processed++

        await sleep(REQUEST_DELAY_MS)
      } catch (err: any) {
        errors.push({ order: o.order_number, error: err.message })
      }
    }

    const elapsed = Date.now() - startTime
    return NextResponse.json({
      ok: true,
      processed,
      discrepancies,
      elapsed_ms: elapsed,
      days,
      threshold,
      results,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message, stack: err.stack?.split('\n').slice(0, 5).join('\n') }, { status: 500 })
  }
}