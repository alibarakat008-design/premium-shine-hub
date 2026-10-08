// POST para simular Vercel cron
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

async function getMLToken() {
  const acc = await prisma.marketplace_accounts.findFirst({
    where: { plataforma: 'mercado_livre', ativa: true },
    orderBy: { updated_at: 'desc' },
  })
  return acc?.access_token
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// POST para testar manualmente, GET se chamado via Vercel cron
export async function GET(req: Request) {
  return runReconciliation(req)
}

export async function POST(req: Request) {
  return runReconciliation(req)
}

async function runReconciliation(req: Request) {
  const start = Date.now()
  try {
    // Pega dias da query ou usa 7
    const url = new URL(req.url)
    const days = Number(url.searchParams.get('days')) || 7
    const batchSize = Number(url.searchParams.get('batch')) || 30

    const token = await getMLToken()
    if (!token) return NextResponse.json({ ok: false, error: 'no token' }, { status: 500 })

    const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    const orders = await prisma.orders.findMany({
      where: {
        created_at: { gte: sinceDate },
        origem: 'mercado_livre',
        order_number: { not: null },
      },
      orderBy: { created_at: 'desc' },
      take: batchSize,
    })

    let processed = 0
    let flagged = 0
    const errors: any[] = []

    for (const o of orders) {
      if (!o.order_number) continue
      try {
        const dec = (d: any) => (d ? Number(d.toString()) : 0)
        const mlResp = await fetch(`https://api.mercadolibre.com/orders/${o.order_number}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!mlResp.ok) {
          if (mlResp.status === 404) { processed++; continue }
          errors.push({ order: o.order_number, error: `ML ${mlResp.status}` })
          continue
        }
        const mlOrder: any = await mlResp.json()
        let logisticType = o.tipo_envio || null
        let shipCosts: any = { receiver: {}, senders: [{}] }
        if (mlOrder.shipping?.id) {
          try {
            const cResp = await fetch(`https://api.mercadolibre.com/shipments/${mlOrder.shipping.id}/costs`, {
              headers: { Authorization: `Bearer ${token}` },
            })
            if (cResp.ok) shipCosts = await cResp.json()
            const sResp = await fetch(`https://api.mercadolibre.com/shipments/${mlOrder.shipping.id}`, {
              headers: { Authorization: `Bearer ${token}` },
            })
            if (sResp.ok) {
              const shipment: any = await sResp.json()
              logisticType = shipment.logistic_type || logisticType
            }
          } catch {}
        }
        const saleFee = mlOrder.sale_fee ? Number(mlOrder.sale_fee) : 0
        const mlVenda = mlOrder.total_amount ? Number(mlOrder.total_amount) : dec(o.total)
        const subtotal = dec(o.subtotal)
        const senderSave = shipCosts?.senders?.[0]?.save ? Number(shipCosts.senders[0].save) : 0
        const receiverSave = shipCosts?.receiver?.save ? Number(shipCosts.receiver.save) : 0
        let mlReceb = 0
        if (logisticType === 'self_service') {
          mlReceb = subtotal - saleFee + Math.max(senderSave, receiverSave)
        } else {
          mlReceb = mlVenda - saleFee + senderSave + receiverSave
        }
        mlReceb = Number(mlReceb.toFixed(2))
        const dbReceb = dec(o.recebimento_liquido)
        const diff = Number((mlReceb - dbReceb).toFixed(2))

        await prisma.$executeRawUnsafe(
          `INSERT INTO reconciliation_results (order_id, order_number, pack_id, tipo_envio, ml_receb, db_receb, diff, ml_sale_fee, ml_receiver_save, ml_sender_save, ml_venda)
           VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          o.id, o.order_number, o.pack_id, logisticType,
          mlReceb, dbReceb, diff, saleFee, receiverSave, senderSave, mlVenda,
        )
        if (Math.abs(diff) > 0.5) flagged++
        processed++
        await sleep(250)
      } catch (err: any) {
        errors.push({ order: o.order_number, error: err.message })
      }
    }

    return NextResponse.json({
      ok: true,
      processed,
      flagged,
      elapsed_ms: Date.now() - start,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}