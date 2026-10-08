import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// GET /api/cron/nightly-refetch?days=1&batch=80
// Para cada venda ML dos últimos N dias, verifica anomalias e refetch da API do ML.
// Anomalias:
//   1. FULL/cross com bonus_envio > 0 (zero deveria ser)
//   2. FULL com bonus_cupom = 0 E comissao_seller < tarifa_pct (cupom faltando)
//   3. receb divergente > R$ 5 do calculado canônico (fórmula)
//   4. tipo_envio vazio (re-detectar do ML)
// Rate limit entre requests pra não estourar limite ML

async function getMLToken(): Promise<string | null> {
  const acc = await prisma.marketplace_accounts.findFirst({
    where: { plataforma: 'mercado_livre', ativa: true },
    orderBy: { updated_at: 'desc' },
  })
  return acc?.access_token || null
}

async function refetchOne(orderNumber: string, token: string) {
  const dec = (d: any) => (d ? Number(d.toString()) : 0)
  const o = await prisma.orders.findFirst({ where: { order_number: orderNumber } })
  if (!o) return { order: orderNumber, ok: false, error: 'not found' }

  const r1 = await fetch(`https://api.mercadolibre.com/orders/${orderNumber}`, { headers: { Authorization: `Bearer ${token}` } })
  if (!r1.ok) return { order: orderNumber, ok: false, error: `ML ${r1.status}` }
  const mlOrder: any = await r1.json()

  const shippingId = mlOrder.shipping?.id
  let shipCosts: any = { receiver: {}, senders: [{}] }
  let shipment: any = null
  if (shippingId) {
    try {
      const sResp = await fetch(`https://api.mercadolibre.com/shipments/${shippingId}`, { headers: { Authorization: `Bearer ${token}` } })
      if (sResp.ok) shipment = await sResp.json()
    } catch {}
    try {
      const cResp = await fetch(`https://api.mercadolibre.com/shipments/${shippingId}/costs`, { headers: { Authorization: `Bearer ${token}` } })
      if (cResp.ok) shipCosts = await cResp.json()
    } catch {}
  }

  // Sempre usar tipo_envio do ML como fonte da verdade
  const logisticType = shipment?.logistic_type || o.tipo_envio || null

  let saleFee = 0
  if (Array.isArray(mlOrder.order_items)) {
    for (const it of mlOrder.order_items) {
      const qty = Number(it.quantity || 1)
      const saleFeeUnit = Number(it.sale_fee || 0)
      saleFee += saleFeeUnit * qty
    }
  }
  const totalAmount = mlOrder.total_amount ? Number(mlOrder.total_amount.toString?.() ?? mlOrder.total_amount) : dec(o.total)
  // IMPORTANTE: tarifa ML é sobre o TOTAL_pago_pelo_buyer (total_amount), NÃO sobre a soma dos itens.
  // Pra packs com desconto, total_amount < sum(unit_price × qty).
  const tarifaPct = Number((totalAmount * 0.12).toFixed(2))
  const senderCost = shipCosts?.senders?.[0]?.cost ? Number(shipCosts.senders[0].cost.toString?.() ?? shipCosts.senders[0].cost) : 0
  const senderSave = shipCosts?.senders?.[0]?.save ? Number(shipCosts.senders[0].save.toString?.() ?? shipCosts.senders[0].save) : 0
  const receiverSave = shipCosts?.receiver?.save ? Number(shipCosts.receiver.save.toString?.() ?? shipCosts.receiver.save) : 0
  const cupomImplicito = Number(Math.max(0, tarifaPct - saleFee).toFixed(2))
  let cupomExplicito = 0
  if (Array.isArray(mlOrder.payments)) {
    for (const p of mlOrder.payments) {
      if (p.coupon_amount && Number(p.coupon_amount) > 0) cupomExplicito += Number(p.coupon_amount)
    }
  }
  const bonusCupomTotal = Number((cupomImplicito + cupomExplicito).toFixed(2))
  const bonusEnvio = logisticType === 'self_service'
    ? Number(Math.min(5, Math.max(senderSave, receiverSave)).toFixed(2))
    : 0
  let recebimento = 0
  if (logisticType === 'self_service') {
    // FLEX: ML repassa carrier, frete passa pelo seller (NÃO desconta do receb)
    recebimento = Number((totalAmount - tarifaPct + bonusEnvio + bonusCupomTotal).toFixed(2))
  } else {
    // FULL / cross_docking / xd_dropoff / agency: ML desconta frete do seller
    // (em FULL é ML mesmo, em cross é o carrier que recebe do buyer mas ML desconta do receb)
    recebimento = Number((totalAmount - tarifaPct - senderCost + bonusCupomTotal).toFixed(2))
  }

  // frete = sender.cost quando tipo_envio != self_service (ML desconta)
  // pra self_service, frete fica 0 (passa pelo seller via bonus_envio)
  const freteParaDb = logisticType === 'self_service' ? 0 : senderCost

  await prisma.$executeRawUnsafe(
    `UPDATE orders
     SET comissao_seller_valor = $1,
         bonus_envio_valor = $2,
         bonus_cupom_valor = $3,
         tarifa_pct_valor = $4,
         recebimento_liquido = $5,
         frete = $6,
         tipo_envio = COALESCE($7, tipo_envio)
     WHERE id = $8::uuid`,
    Number(saleFee.toFixed(2)), bonusEnvio, bonusCupomTotal, tarifaPct, recebimento, freteParaDb, logisticType, o.id,
  )

  return {
    order: orderNumber,
    ok: true,
    anterior_receb: dec(o.recebimento_liquido),
    novo_receb: recebimento,
    anterior_bonus_envio: dec(o.bonus_envio_valor),
    novo_bonus_envio: bonusEnvio,
    anterior_bonus_cupom: dec(o.bonus_cupom_valor),
    novo_bonus_cupom: bonusCupomTotal,
    tipo_envio: logisticType,
  }
}

async function runCron(days: number, batch: number) {
  const t0 = Date.now()
  const token = await getMLToken()
  if (!token) return { ok: false, error: 'sem token ML' }

  // Detectar anomalias:
  // - FULL/cross com bonus_envio > 0
  // - venda com bonus_cupom = 0 E comissao_seller_valor < tarifa_pct_valor E tipo_envio = 'fulfillment'
  // - tipo_envio vazio
  const candidates: any[] = await prisma.$queryRawUnsafe(`
    SELECT order_number, pack_id, tipo_envio, total, comissao_seller_valor,
           bonus_envio_valor, bonus_cupom_valor, tarifa_pct_valor, recebimento_liquido
    FROM orders
    WHERE origem = 'mercado_livre'
      AND created_at > NOW() - (INTERVAL '${Math.max(1, days)} days')
      AND order_number IS NOT NULL
      AND (
        (tipo_envio IN ('fulfillment','cross_docking','xd_dropoff') AND (bonus_envio_valor IS NULL OR bonus_envio_valor > 0))
        OR (tipo_envio = 'fulfillment' AND (bonus_cupom_valor IS NULL OR bonus_cupom_valor = 0) AND comissao_seller_valor IS NOT NULL AND comissao_seller_valor > 0 AND comissao_seller_valor < tarifa_pct_valor)
        OR tipo_envio IS NULL
      )
    ORDER BY created_at DESC
    LIMIT ${batch}
  `)

  let processed = 0
  let corrected = 0
  const results: any[] = []
  for (const c of candidates) {
    try {
      const r = await refetchOne(c.order_number, token)
      results.push(r)
      processed++
      if (r.ok && Math.abs(Number(r.anterior_receb) - Number(r.novo_receb)) > 0.01) corrected++
      // ~300ms entre requests pra respeitar rate limit ML
      await new Promise(res => setTimeout(res, 300))
    } catch (err: any) {
      results.push({ order: c.order_number, ok: false, error: err.message })
    }
  }

  return {
    ok: true,
    elapsed_ms: Date.now() - t0,
    candidates: candidates.length,
    processed,
    corrected,
    sample: results.slice(0, 30),
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const days = Number(searchParams.get('days') || 1)
    const batch = Number(searchParams.get('batch') || 80)
    const skipParceiros = searchParams.get('skip_parceiros') === '1'

    const r = await runCron(days, batch)

    // Após refetch da matriz, importa vendas novas dos parceiros
    let parceiroSync: any = null
    if (!skipParceiros) {
      try {
        const syncReq = new Request(`${new URL(req.url).origin}/api/cron/sync-parceiros?days=7&batch=200`, {
          headers: { authorization: `Bearer ${process.env.CRON_SECRET || 'shinecron2026'}` },
        })
        const syncRes = await fetch(syncReq)
        parceiroSync = await syncRes.json()
      } catch (e: any) {
        parceiroSync = { ok: false, error: e.message }
      }
    }

    // BACKFILL DE STATUS: re-busca status real do ML pra detectar cancelados/entregues
    // que o sync inicial não pegou. Roda DEPOIS do refetch/sync pra ter vendas atualizadas.
    let statusBackfill: any = null
    try {
      const statusReq = new Request(`${new URL(req.url).origin}/api/admin/backfill-status?days=2&batch=100`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${process.env.CRON_SECRET || 'shinecron2026'}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      })
      const statusRes = await fetch(statusReq)
      statusBackfill = await statusRes.json()
    } catch (e: any) {
      statusBackfill = { ok: false, error: e.message }
    }

    return NextResponse.json({
      ...r,
      parceiro_sync: parceiroSync,
      status_backfill: statusBackfill,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}