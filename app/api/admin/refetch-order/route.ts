import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// GET/POST /api/admin/refetch-order?order=200...
// Busca a venda na API do ML (fonte da verdade), recalcula tudo e salva:
//   - comissao_seller_valor (sale_fee real)
//   - bonus_envio_valor (max sender_save / receiver_save se FLEX; senão 0)
//   - bonus_cupom_valor (tarifa_pct - sale_fee se positivo)
//   - tarifa_pct_valor (12% × total_amount)
//   - tarifa_fixa_valor
//   - recebimento_liquido (formula por tipo)
//
// query params:
//   dry_run=1 → só calcula e mostra, sem salvar
//   order= → UUID, order_number ou pack_id

async function refetchOrder(orderId: string, dryRun: boolean) {
  const dec = (d: any) => (d ? Number(d.toString()) : 0)
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
  if (!o) return { ok: false, error: 'venda não encontrada' }

  const acc = await prisma.marketplace_accounts.findFirst({
    where: { plataforma: 'mercado_livre', ativa: true },
    orderBy: { updated_at: 'desc' },
  })
  if (!acc?.access_token) return { ok: false, error: 'sem token ML' }
  const token = acc.access_token
  const orderNumber = o.order_number
  if (!orderNumber) return { ok: false, error: 'venda sem order_number' }

  // 1) /orders/{id} — fonte da verdade
  const r1 = await fetch(`https://api.mercadolibre.com/orders/${orderNumber}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!r1.ok) return { ok: false, error: `ML /orders ${r1.status}` }
  const mlOrder: any = await r1.json()

  // 2) /shipments/{id}/costs e /shipments/{id}
  let shipCosts: any = { receiver: {}, senders: [{}] }
  let logisticType = o.tipo_envio || null
  let baseCost = 0
  let listCost = 0
  if (mlOrder.shipping?.id) {
    try {
      const [cResp, sResp] = await Promise.all([
        fetch(`https://api.mercadolibre.com/shipments/${mlOrder.shipping.id}/costs`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`https://api.mercadolibre.com/shipments/${mlOrder.shipping.id}`, { headers: { Authorization: `Bearer ${token}` } }),
      ])
      if (cResp.ok) shipCosts = await cResp.json()
      if (sResp.ok) {
        const shipment: any = await sResp.json()
        logisticType = shipment.logistic_type || logisticType
        baseCost = shipment.base_cost ? Number(shipment.base_cost.toString?.() ?? shipment.base_cost) : 0
        const opt = shipment.shipping_options?.[0]
        if (opt) {
          listCost = opt.list_cost ? Number(opt.list_cost.toString?.() ?? opt.list_cost) : 0
        }
      }
    } catch {}
  }

  // 3) Extrair campos
  // sale_fee fica em order_items[].sale_fee (por item unitário; multiplicar por qtd)
  let saleFee = 0
  let tarifaCheiaTotal = 0
  if (Array.isArray(mlOrder.order_items)) {
    for (const it of mlOrder.order_items) {
      const qty = Number(it.quantity || 1)
      const unitPrice = Number(it.unit_price || 0)
      const saleFeeUnit = Number(it.sale_fee || 0)
      saleFee += saleFeeUnit * qty
      tarifaCheiaTotal += unitPrice * qty * 0.12
    }
  }
  const totalAmount = mlOrder.total_amount ? Number(mlOrder.total_amount.toString?.() ?? mlOrder.total_amount) : dec(o.total)
  const subtotal = dec(o.subtotal)
  const senderCost = shipCosts?.senders?.[0]?.cost ? Number(shipCosts.senders[0].cost.toString?.() ?? shipCosts.senders[0].cost) : 0
  const senderSave = shipCosts?.senders?.[0]?.save ? Number(shipCosts.senders[0].save.toString?.() ?? shipCosts.senders[0].save) : 0
  const receiverSave = shipCosts?.receiver?.save ? Number(shipCosts.receiver.save.toString?.() ?? shipCosts.receiver.save) : 0

  // 4) Calcular campos canônicos
  const tarifaPct = Number(tarifaCheiaTotal.toFixed(2))
  // cupom implícito = max(0, tarifa_pct - sale_fee). Se tag 'order_has_discount', é forte sinal.
  const tags = mlOrder.tags || []
  let cupomImplicito = Number(Math.max(0, tarifaPct - saleFee).toFixed(2))
  if (Array.isArray(tags) && tags.includes('order_has_discount') && cupomImplicito === 0 && saleFee < tarifaPct) {
    cupomImplicito = Number((tarifaPct - saleFee).toFixed(2))
  }
  // cupom explícito em payments[].coupon_amount
  let cupomExplicito = 0
  if (Array.isArray(mlOrder.payments)) {
    for (const p of mlOrder.payments) {
      if (p.coupon_amount && Number(p.coupon_amount) > 0) cupomExplicito += Number(p.coupon_amount)
    }
  }

  // Tarifa fixa ML: tabela por faixa de preço. SÓ se aplica em FLEX (self_service).
  // Em FULL/cross/agency, ML cobra só tarifa_pct (12%) — fixa não desconta.
  // até R$ 12,50 → R$ 6,25 / R$ 12,51-29 → R$ 6,50 / R$ 29,01-50 → R$ 6,75 / R$ 50,01-79 → R$ 7,00
  const tarifaFixaTabela = logisticType === 'self_service'
    ? (totalAmount <= 12.5 ? 6.25
      : totalAmount <= 29 ? 6.5
      : totalAmount <= 50 ? 6.75
      : totalAmount <= 79 ? 7.0
      : 0)
    : 0

  // cupom_implicito = max(0, tarifa_bruta_estimada - sale_fee)
  // Onde tarifa_bruta_estimada = tarifa_pct (+ tarifa_fixa_tabela se FLEX)
  const cupomImplicitoReal = Number(Math.max(0, (tarifaPct + tarifaFixaTabela) - saleFee).toFixed(2))
  const bonusCupomTotal = Number((cupomImplicitoReal + cupomExplicito).toFixed(2))

  // Tarifa fixa pra salvar no DB (usa a tabela; se já tem valor calculado via sync, mantém)
  const tarifaFixa = tarifaFixaTabela

  // bonus_envio:
  //   - FLEX (self_service): ML repassa carrier via receiver.save (mais comum) ou sender.save
  //     base_cost - list_cost é fallback quando list_cost > 0 (caso raro em FLEX)
  //   - FULL/Cross: 0 (ML desconta frete direto, não tem bônus)
  // NÃO cap em R$ 5 — valores como R$ 11 podem ocorrer quando ML paga frete cheio
  //
  // IMPORTANTE — PACKS: o ML atribui bônus_envio (receiver.save) APENAS à PRIMEIRA venda
  // do pack (a de created_at mais antigo). As outras vendas do pack devem ter bonus_envio=0
  // pra não inflar o total. Validado: pack 2000013825202983 (67,32) tem 10,90 de bônus_envio
  // SOMENTE na venda 2000017229749110 (a primeira).
  let bonusEnvio = 0
  if (logisticType === 'self_service') {
    const carrierReimbursement = Math.max(0, Number((baseCost - listCost).toFixed(2)))
    const candidateBonus = Number(Math.max(carrierReimbursement, senderSave, receiverSave).toFixed(2))

    // Detectar se esta venda é a primeira do pack (pack_order)
    let isFirstOfPack = true
    if (o.pack_id && o.pack_id !== o.order_number) {
      const firstOrder: any[] = await prisma.$queryRawUnsafe(
        `SELECT order_number FROM orders
         WHERE pack_id = $1::text
         ORDER BY created_at ASC LIMIT 1`,
        o.pack_id,
      )
      isFirstOfPack = firstOrder.length > 0 && String(firstOrder[0].order_number) === String(orderNumber)
    }

    bonusEnvio = isFirstOfPack ? candidateBonus : 0
  } else {
    bonusEnvio = 0
  }

  // Recebimento por tipo:
  //   FLEX: totalAmount − tarifaPct + bonus_envio + cupom (frete é pago à parte via custo_flex R$13,90)
  //   FULL: totalAmount − tarifaPct − senderCost + cupom (ML desconta frete)
  //   cross/Clássico: totalAmount − tarifaPct − senderCost + cupom (buyer pagou frete direto,
  //          mas ML desconta do receb do seller via sender.cost)
  let recebimento = 0
  if (logisticType === 'self_service') {
    // FLEX: receb = venda - tarifa_pct - tarifa_fixa + bonus_envio + bonus_cupom
    // (tarifa_fixa embutida na sale_fee; cupom estorna parte)
    // Validado: 38,10 - 4,57 - 6,75 + 11 + 2,38 = 40,16 (Body Splash Flowers FLEX)
    recebimento = Number((totalAmount - tarifaPct - tarifaFixaTabela + bonusEnvio + bonusCupomTotal).toFixed(2))
  } else if (logisticType === 'fulfillment') {
    // FULL: ML desconta frete (sender.cost) do receb do seller.
    // Tarifa fixa SÓ se aplica em FLEX (categoria com custo fixo). Em FULL usa só tarifa_pct.
    // (Na realidade, ML pode cobrar fixa em FULL tb, mas user validou Asad FULL 80,07 → 61,17 = 9,61 tarifa only)
    // Se tarifa_fixa_tabela > 0 E o cupom estorna, ajustamos cupom_implicito:
    //   cupom = max(0, tarifa_pct + tarifa_fixa - sale_fee)
    //   mas como em FULL tarifa_fixa não se aplica, deixa cupom_implicito = max(0, tarifa_pct - sale_fee) (calculado lá em cima)
    recebimento = Number((totalAmount - tarifaPct - senderCost + bonusCupomTotal).toFixed(2))
  } else {
    // cross_docking / xd_dropoff / agency: ML também desconta frete do seller (sender.cost).
    // Mesma lógica que FULL — só tarifa_pct (cross/agency não tem fixa, ou tem mas não desconta do receb).
    // Validado: 77,50 - 9,30 - 7,85 + 4,65 = 65,00 (Kokeshi cross 36,38 = 26,82)
    recebimento = Number((totalAmount - tarifaPct - senderCost + bonusCupomTotal).toFixed(2))
  }

  const result = {
    order_number: orderNumber,
    pack_id: o.pack_id,
    tipo_envio_ml: logisticType,
    total_amount_ml: totalAmount,
    sale_fee_ml: saleFee,
    base_cost_ml: baseCost,
    list_cost_ml: listCost,
    sender_save_ml: senderSave,
    receiver_save_ml: receiverSave,
    sender_cost_ml: senderCost,
    anterior: {
      comissao_seller: dec(o.comissao_seller_valor),
      bonus_envio: dec(o.bonus_envio_valor),
      bonus_cupom: dec(o.bonus_cupom_valor),
      tarifa_pct: dec(o.tarifa_pct_valor),
      recebimento: dec(o.recebimento_liquido),
    },
    novo: {
      comissao_seller: Number(saleFee.toFixed(2)),
      bonus_envio: bonusEnvio,
      bonus_cupom: bonusCupomTotal,
      tarifa_pct: tarifaPct,
      tarifa_fixa: tarifaFixa,
      recebimento,
    },
  }

  if (dryRun) return { ok: true, dry_run: true, ...result }

  // 5) Salvar — frete = sender.cost quando NÃO self_service, 0 quando FLEX
  const freteParaDb = logisticType === 'self_service' ? 0 : senderCost
  await prisma.$executeRawUnsafe(
    `UPDATE orders
     SET comissao_seller_valor = $1,
         bonus_envio_valor = $2,
         bonus_cupom_valor = $3,
         tarifa_pct_valor = $4,
         tarifa_fixa_valor = $5,
         recebimento_liquido = $6,
         frete = $7,
         tipo_envio = COALESCE(NULLIF($8, ''), tipo_envio)
     WHERE id = $9::uuid`,
    Number(saleFee.toFixed(2)), bonusEnvio, bonusCupomTotal, tarifaPct, tarifaFixa, recebimento, freteParaDb, logisticType, o.id,
  )

  return { ok: true, dry_run: false, ...result, saved: true }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const orderId = searchParams.get('order')
    const dryRun = searchParams.get('dry_run') === '1'
    if (!orderId) return NextResponse.json({ ok: false, error: 'order required' }, { status: 400 })
    const result = await refetchOrder(orderId, dryRun)
    if (!result.ok) return NextResponse.json(result, { status: 400 })
    return NextResponse.json(result)
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const orderId = body.order || body.order_id
    const dryRun = body.dry_run === true
    if (!orderId) return NextResponse.json({ ok: false, error: 'order required' }, { status: 400 })
    const result = await refetchOrder(orderId, dryRun)
    if (!result.ok) return NextResponse.json(result, { status: 400 })
    return NextResponse.json(result)
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}