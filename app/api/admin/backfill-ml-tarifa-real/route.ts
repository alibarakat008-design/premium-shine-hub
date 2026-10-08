import { NextResponse } from 'next/server'
import { getMLToken } from '@/lib/ml-auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * Backfill correto da comissão ML, considerando tipo de envio:
 *
 * FULL (logistic_type=fulfillment):
 *   - tarifa = 12% × venda (SEM R$ 6,65 fixo)
 *   - envio = deduzido do recebimento (R$ 13,25 padrão FULL)
 *   - estorno = cupom estorno + bonus ML
 *   - recebimento = venda - tarifa - envio + estorno
 *
 * FLEX (logistic_type=self_service):
 *   - tarifa = 12% × venda + R$ 6,65 fixo
 *   - frete = 0 (ML paga)
 *   - bonus_envio = senders.save ou receiver.save (crédito ao seller)
 *   - recebimento = venda - tarifa_gross + cupom_estorno + bonus_envio
 *
 * Clássico/Agência (cross_docking, me2, xd_drop_off):
 *   - tarifa = 12% × venda + R$ 6,65 fixo
 *   - frete = buyer paga (não desconta do seller)
 *   - bonus_envio = ML reembolso
 *   - recebimento = venda - tarifa_gross + cupom_estorno + bonus_envio
 *
 * GET /api/admin/backfill-ml-tarifa-real?limit=20&days=30
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 30)
    const days = parseInt(searchParams.get('days') || '30')
    const force = searchParams.get('force') === '1'

    const tokenResult = await getMLToken()
    if (!tokenResult?.token) {
      return NextResponse.json({ ok: false, error: 'token ML indisponível' }, { status: 500 })
    }

    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

    const orders = await prisma.orders.findMany({
      where: {
        origem: 'mercado_livre',
        created_at: { gte: cutoff },
        ...(force ? {} : {
          OR: [
            { bonus_envio_valor: null },
            { bonus_cupom_valor: null },
            { bonus_cupom_valor: 0 },
          ],
        }),
      },
      select: {
        id: true,
        order_number: true,
        total: true,
        comissao_seller_valor: true,
        frete: true,
        custo_flex: true,
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

    let atualizadas = 0
    let erros = 0
    const detalhes: any[] = []

    for (const o of orders) {
      try {
        const urlOrder = `https://api.mercadolibre.com/orders/${o.order_number}?access_token=${tokenResult.token}`
        const r = await fetch(urlOrder, { cache: 'no-store' })
        if (!r.ok) { erros++; continue }
        const mlOrder = await r.json()

        const item = mlOrder.order_items?.[0]
        if (!item) { erros++; continue }

        const unitPrice = Number(item.unit_price) || Number(o.total)
        const saleFee = Number(item.sale_fee) || 0

        // 1. Detectar tipo de envio via shipment
        let logisticType = 'me2' // default
        let sendersSave = 0
        let sendersCost = 0
        let receiverSave = 0
        const shippingId = mlOrder.shipping?.id
        if (shippingId) {
          try {
            // pega o logistic_type do shipment
            const rShip = await fetch(`https://api.mercadolibre.com/shipments/${shippingId}?access_token=${tokenResult.token}`, { cache: 'no-store' })
            if (rShip.ok) {
              const ship = await rShip.json()
              logisticType = ship.logistic_type || 'me2'
            }
            // pega os custos
            const rCosts = await fetch(`https://api.mercadolibre.com/shipments/${shippingId}/costs?access_token=${tokenResult.token}`, { cache: 'no-store' })
            if (rCosts.ok) {
              const costs = await rCosts.json()
              const senders = costs.senders?.[0]
              sendersSave = Number(senders?.save) || 0
              sendersCost = Number(senders?.cost) || 0
              receiverSave = Number(costs.receiver?.save) || 0
            }
          } catch {}
        }

        const isFull = logisticType === 'fulfillment'
        const isFlex = logisticType === 'self_service'

        // 2. Calcular tarifa baseado no tipo
        // IMPORTANTE: tarifa_fixa varia por venda/categoria (6,65 OU 7,75 OU outros)
        // - Pra FULL: fixa sempre 0
        // - Pra FLEX/Clássico SEM cupom: fixa = sale_fee - 12% × venda
        // - Pra FLEX/Clássico COM cupom: fixa real não pode ser deduzida, manter valor existente
        const TARIFA_PCT = 0.12
        const tarifaPct = round2(unitPrice * TARIFA_PCT)
        const existingFixa = Number(o.tarifa_fixa_valor) || 0

        let tarifaFixa: number
        let tarifaGross: number
        let bonusCupom: number

        if (isFull) {
          // FULL: tarifa = 12% (sem fixo), cupom estorno = max(0, 12% - sale_fee)
          tarifaFixa = 0
          tarifaGross = tarifaPct
          bonusCupom = round2(Math.max(0, tarifaPct - saleFee))
        } else {
          // FLEX/Clássico: sale_fee = (12% + fixa_real) - cupom
          // Se cupom = 0: sale_fee = 12% + fixa_real, então fixa = sale_fee - 12%
          // Se cupom > 0: fixa_real desconhecida, usar valor existente ou estimar
          const derivedFixa = round2(Math.max(0, saleFee - tarifaPct))
          const temCupom = derivedFixa === 0 && saleFee < tarifaPct
          if (temCupom) {
            // Com cupom: usa fixa existente OU estimar 6,65
            tarifaFixa = existingFixa > 0 ? existingFixa : 6.65
          } else {
            // Sem cupom: deduzir fixa do sale_fee (sempre)
            tarifaFixa = derivedFixa > 0 ? derivedFixa : (existingFixa > 0 ? existingFixa : 6.65)
          }
          tarifaGross = round2(tarifaPct + tarifaFixa)
          bonusCupom = round2(Math.max(0, tarifaGross - saleFee))
        }

        // 4. Bonus envio baseado no tipo
        let bonusEnvio = 0
        let custoFlex = 0
        if (isFull) {
          // FULL: o envio já vem descontado pelo `frete` field (ML desconta direto)
          // bonus_envio = 0 (não tem reimbursement específico)
          bonusEnvio = 0
          custoFlex = 0
        } else if (isFlex) {
          // FLEX: ML paga frete; bônus_envio vem de senders.save ou receiver.save
          if (sendersSave > 0) {
            bonusEnvio = sendersSave
          } else if (sendersCost === 0 && receiverSave > 0) {
            bonusEnvio = receiverSave
          }
          custoFlex = 13.90 // custo fixo do FLEX (não desconta do recebimento)
        } else {
          // Clássico/Agência
          if (sendersSave > 0) {
            bonusEnvio = sendersSave
          } else if (sendersCost > 0 && receiverSave > 0) {
            bonusEnvio = receiverSave
          } else if (receiverSave > 0) {
            bonusEnvio = receiverSave
          }
          custoFlex = 0
        }

        // 5. Calcular recebimento ML baseado no tipo
        let recebimento: number
        if (isFull) {
          // FULL: recebimento = venda - tarifa_gross - envio + cupom_estorno
          const envioDeduzido = Number(o.frete) || 0
          recebimento = round2(Number(o.total) - tarifaGross - envioDeduzido + bonusCupom)
        } else {
          // FLEX/Clássico: recebimento = venda - tarifa_gross + cupom_estorno + bonus_envio
          recebimento = round2(Number(o.total) - tarifaGross + bonusCupom + bonusEnvio)
        }

        // 6. Atualizar no banco
        await prisma.orders.update({
          where: { id: o.id },
          data: {
            tarifa_pct_valor: tarifaPct,
            tarifa_fixa_valor: tarifaFixa,
            bonus_cupom_valor: bonusCupom,
            bonus_envio_valor: bonusEnvio,
            recebimento_liquido: recebimento,
            tipo_envio: logisticType,
            custo_flex: custoFlex || null,
            comissao_seller_valor: tarifaGross, // comissão BRUTA (não a líquida do API)
          },
        })

        atualizadas++
        detalhes.push({
          id: o.order_number,
          tipo: logisticType,
          isFull,
          isFlex,
          venda: Number(o.total),
          unit_price: unitPrice,
          sale_fee: saleFee,
          tarifa_pct: tarifaPct,
          tarifa_fixa: tarifaFixa,
          tarifa_gross: tarifaGross,
          cupom_estorno: bonusCupom,
          bonus_envio: bonusEnvio,
          custo_flex: custoFlex,
          envio_deduzido: isFull ? Number(o.frete) : 0,
          recebimento_ml: recebimento,
        })
      } catch (err: any) {
        erros++
        detalhes.push({ id: o.order_number, erro: err.message })
      }
    }

    return NextResponse.json({
      ok: true,
      total: orders.length,
      atualizadas,
      erros,
      detalhes,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}