import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

async function getMLToken() {
  const acc = await prisma.marketplace_accounts.findFirst({
    where: { plataforma: 'mercado_livre', ativa: true },
    orderBy: { updated_at: 'desc' },
  })
  return acc?.access_token
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const orderId = body.order || body.order_id
    if (!orderId) return NextResponse.json({ ok: false, error: 'order required' }, { status: 400 })

    // 1. Pega a venda no DB
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
    if (!o) return NextResponse.json({ ok: false, error: 'order not found' }, { status: 404 })
    if (!o.order_number) return NextResponse.json({ ok: false, error: 'order_number missing' }, { status: 400 })

    // 2. Pega dados ML
    const token = await getMLToken()
    if (!token) return NextResponse.json({ ok: false, error: 'no token' }, { status: 500 })

    const mlResp = await fetch(`https://api.mercadolibre.com/orders/${o.order_number}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!mlResp.ok) return NextResponse.json({ ok: false, error: 'ML fetch failed', status: mlResp.status }, { status: 502 })
    const mlData: any = await mlResp.json()

    let bonusEnvio = 0
    let cupomFromReceiver = 0
    let freteLiquido = 0
    if (mlData.shipping?.id) {
      const sId = mlData.shipping.id
      // Pega shipment pra detectar full vs flex
      const sResp = await fetch(`https://api.mercadolibre.com/shipments/${sId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const shipment: any = await sResp.json()
      const isFlex = shipment.logistic_type === 'self_service'
      const isFull = shipment.logistic_type === 'fulfillment'

      // Pega /shipments/{id}/costs
      const cResp = await fetch(`https://api.mercadolibre.com/shipments/${sId}/costs`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const costs: any = await cResp.json()
      const sender = costs.senders?.[0]
      const receiver = costs.receiver

      const senderSave = sender?.save ? Number(sender.save.toString()) : 0
      const senderCost = sender?.cost ? Number(sender.cost.toString()) : 0
      const receiverSave = receiver?.save ? Number(receiver.save.toString()) : 0

      if (isFlex) {
        // FLEX: ML devolve frete via bônus envio (= sender_save se > 0, senão receiver_save)
        bonusEnvio = senderSave > 0 ? senderSave : receiverSave
        freteLiquido = 0 // FLEX não desconta frete
      } else if (isFull) {
        // FULL: ML desconta frete = sender_cost, devolve diferença? Não tem save típico em FULL
        bonusEnvio = 0
        freteLiquido = senderCost // líquido a pagar
      } else {
        // Clássico / cross_docking: frete pago pelo buyer, sender_save é o bônus (reembolso)
        bonusEnvio = receiverSave // receiver.save = cupom que ML devolve
        freteLiquido = 0
      }

      cupomFromReceiver = receiverSave > bonusEnvio ? receiverSave - bonusEnvio : 0
    }

    const dec = (d: any) => (d ? Number(d.toString()) : 0)
    const total = dec(o.total)
    const tarifaPct = dec(o.tarifa_pct_valor) || total * 0.12
    const tarifaFixa = dec(o.tarifa_fixa_valor)
    const saleFee = dec(o.comissao_seller_valor)
    const freteAtual = dec(o.frete)
    const bonusCupomAtual = dec(o.bonus_cupom_valor)

    // freteReal = quanto ML desconta do vendedor (depende do tipo)
    let freteReal = 0
    if (o.tipo_envio === 'fulfillment') freteReal = freteAtual
    // FLEX, cross_docking, me2 não desconta do vendedor

    // Cupom implícito = tarifa_pct_bruta − sale_fee (se positivo)
    const cupomImplicito = Math.max(0, Number((tarifaPct - saleFee).toFixed(2)))

    // Novo bonus_envio_valor
    const novoBonusEnvio = Number(bonusEnvio.toFixed(2))
    // Novo bonus_cupom_valor: SUBSTITUI o anterior, não soma (cupom_implicito + cupom_receiver)
    const novoBonusCupom = Number((cupomImplicito + cupomFromReceiver).toFixed(2))

    // Recebimento = venda - sale_fee - freteReal + bonus_envio + bonus_cupom
    // FLEX: freteReal = 0 (ML não desconta do vendedor)
    // FULL: freteReal = freteAtual (sender_cost que ML desconta)
    // Cross_docking/Clássico: freteReal = 0 (buyer pagou)
    const novoRecebimento = Number(
      (total - saleFee - freteReal + novoBonusEnvio + novoBonusCupom).toFixed(2)
    )

    // Atualiza
    await prisma.orders.update({
      where: { id: o.id },
      data: {
        bonus_envio_valor: novoBonusEnvio,
        bonus_cupom_valor: novoBonusCupom,
        recebimento_liquido: novoRecebimento,
      },
    })

    return NextResponse.json({
      ok: true,
      order_number: o.order_number,
      total,
      sale_fee: saleFee,
      tarifa_pct: tarifaPct,
      tarifa_fixa: tarifaFixa,
      bonus_envio_anterior: dec(o.bonus_envio_valor),
      bonus_envio_novo: novoBonusEnvio,
      bonus_cupom_anterior: bonusCupomAtual,
      bonus_cupom_novo: novoBonusCupom,
      cupom_implicito_extra: cupomImplicito,
      cupom_receiver_extra: cupomFromReceiver,
      recebimento_anterior: dec(o.recebimento_liquido),
      recebimento_novo: novoRecebimento,
      ml_sender_save: bonusEnvio,
      ml_receiver_save: cupomFromReceiver + bonusEnvio,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message, stack: err.stack?.split('\n').slice(0, 5).join('\n') }, { status: 500 })
  }
}