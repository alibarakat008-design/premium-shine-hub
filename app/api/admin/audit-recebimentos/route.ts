import { NextResponse } from 'next/server'
import { getMLToken } from '@/lib/ml-auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * Auditoria: compara os valores salvos no DB com o cálculo real baseado na API ML.
 *
 * Para cada venda:
 * - Busca /orders/{id} → pega unit_price, sale_fee, shipping.id
 * - Busca /shipments/{id} → pega logistic_type
 * - Recalcula tarifa_gross + cupom_estorno + bonus_envio
 * - Compara com valores no DB
 * - Lista discrepâncias (recebimento_liquido errado)
 *
 * GET /api/admin/audit-recebimentos?limit=30&days=15
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = Math.min(parseInt(searchParams.get('limit') || '30'), 30)
    const days = parseInt(searchParams.get('days') || '15')
    const fix = searchParams.get('fix') === '1'

    const tokenResult = await getMLToken()
    if (!tokenResult?.token) {
      return NextResponse.json({ ok: false, error: 'token ML indisponível' }, { status: 500 })
    }

    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

    const orders = await prisma.orders.findMany({
      where: {
        origem: 'mercado_livre',
        created_at: { gte: cutoff },
        status: { not: 'cancelado' },
      },
      select: {
        id: true,
        order_number: true,
        total: true,
        comissao_seller_valor: true,
        frete: true,
        recebimento_liquido: true,
        tipo_envio: true,
        bonus_envio_valor: true,
        bonus_cupom_valor: true,
        tarifa_pct_valor: true,
        tarifa_fixa_valor: true,
      },
      orderBy: { created_at: 'desc' },
      take: limit,
    })

    const TARIFA_PCT = 0.12
    const TARIFA_FIXA = 6.65
    const discrepantes: any[] = []
    let atualizadas = 0

    for (const o of orders) {
      try {
        const r = await fetch(`https://api.mercadolibre.com/orders/${o.order_number}?access_token=${tokenResult.token}`, { cache: 'no-store' })
        if (!r.ok) continue
        const mlOrder = await r.json()
        const item = mlOrder.order_items?.[0]
        if (!item) continue

        const unitPrice = Number(item.unit_price) || Number(o.total)
        const saleFee = Number(item.sale_fee) || 0
        const shippingId = mlOrder.shipping?.id

        let logisticType = 'me2'
        let sendersSave = 0, sendersCost = 0, receiverSave = 0
        if (shippingId) {
          try {
            const rShip = await fetch(`https://api.mercadolibre.com/shipments/${shippingId}?access_token=${tokenResult.token}`, { cache: 'no-store' })
            if (rShip.ok) {
              const ship = await rShip.json()
              // Sanity check: garante que o shipment é realmente desta order
              if (ship.order_id && Number(ship.order_id) !== Number(o.order_number)) {
                discrepantes.push({ id: o.order_number, erro: `shipment ${shippingId} é de outra order (${ship.order_id})` })
                continue
              }
              logisticType = ship.logistic_type || 'me2'
            }
            const rCosts = await fetch(`https://api.mercadolibre.com/shipments/${shippingId}/costs?access_token=${tokenResult.token}`, { cache: 'no-store' })
            if (rCosts.ok) {
              const costs = await rCosts.json()
              // Valida que os costs são deste pack (senders.user_id = nosso seller)
              const senders = costs.senders?.[0]
              const sellerId = mlOrder.seller?.id
              if (senders?.user_id && sellerId && Number(senders.user_id) !== Number(sellerId)) {
                discrepantes.push({ id: o.order_number, erro: `costs.senders.user_id ${senders.user_id} != seller ${sellerId}` })
                continue
              }
              sendersSave = Number(senders?.save) || 0
              sendersCost = Number(senders?.cost) || 0
              receiverSave = Number(costs.receiver?.save) || 0
            }
          } catch {}
        }

        const isFull = logisticType === 'fulfillment'
        const isFlex = logisticType === 'self_service'

        // Recalcular tarifa_gross correto
        const tarifaPct = round2(unitPrice * TARIFA_PCT)
        const tarifaFixa = isFull ? 0 : TARIFA_FIXA
        const tarifaGross = round2(tarifaPct + tarifaFixa)
        const cupomEstorno = round2(Math.max(0, tarifaGross - saleFee))

        // Recalcular bonus_envio
        let bonusEnvio = 0
        let custoFlex = 0
        if (isFull) {
          bonusEnvio = 0
          custoFlex = 0
        } else if (isFlex) {
          if (sendersSave > 0) bonusEnvio = sendersSave
          else if (sendersCost === 0 && receiverSave > 0) bonusEnvio = receiverSave
          custoFlex = 13.90
        } else {
          // Clássico
          if (sendersSave > 0) bonusEnvio = sendersSave
          else if (receiverSave > 0) bonusEnvio = receiverSave
          custoFlex = 0
        }

        // Calcular recebimento ML
        let recebimentoCalculado: number
        if (isFull) {
          const envioDeduzido = Number(o.frete) || 0
          recebimentoCalculado = round2(Number(o.total) - tarifaGross - envioDeduzido + cupomEstorno)
        } else {
          recebimentoCalculado = round2(Number(o.total) - tarifaGross + cupomEstorno + bonusEnvio)
        }

        const recebimentoSalvo = Number(o.recebimento_liquido) || 0
        const diff = Math.abs(recebimentoCalculado - recebimentoSalvo)

        if (diff >= 0.01) {
          discrepantes.push({
            id: o.order_number,
            tipo: logisticType,
            venda: Number(o.total),
            tarifa_pct: tarifaPct,
            tarifa_fixa: tarifaFixa,
            tarifa_gross: tarifaGross,
            cupom_estorno: cupomEstorno,
            bonus_envio: bonusEnvio,
            bonus_envio_salvo: Number(o.bonus_envio_valor) || 0,
            frete_salvo: Number(o.frete) || 0,
            recebimento_salvo: recebimentoSalvo,
            recebimento_calculado: recebimentoCalculado,
            diff: round2(diff),
          })

          if (fix) {
            await prisma.orders.update({
              where: { id: o.id },
              data: {
                tarifa_pct_valor: tarifaPct,
                tarifa_fixa_valor: tarifaFixa,
                bonus_cupom_valor: cupomEstorno,
                bonus_envio_valor: bonusEnvio,
                recebimento_liquido: recebimentoCalculado,
                tipo_envio: logisticType,
                custo_flex: custoFlex || null,
              },
            })
            atualizadas++
          }
        }
      } catch (err: any) {
        discrepantes.push({ id: o.order_number, erro: err.message })
      }
    }

    return NextResponse.json({
      ok: true,
      total_auditados: orders.length,
      discrepantes: discrepantes.length,
      atualizadas: fix ? atualizadas : 0,
      detalhes: discrepantes,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}