import { NextResponse } from 'next/server'
import { getMLToken } from '@/lib/ml-auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * Corrige frete + cupom para vendas FULL baseado em /shipments/{id}/costs:
 * - sellers.cost = frete LÍQUIDO que o seller paga
 * - comissao_seller_valor = sale_fee da API (já com cupom descontado)
 * - bonus_cupom_valor = tarifa_pct - sale_fee (estorno do cupom)
 * - recebimento = venda - tarifa_pct - frete + cupom
 *
 * GET /api/admin/fix-frete-full?limit=20&days=30
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 30)
    const days = parseInt(searchParams.get('days') || '30')

    const tokenResult = await getMLToken()
    if (!tokenResult?.token) {
      return NextResponse.json({ ok: false, error: 'token ML indisponível' }, { status: 500 })
    }

    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

    const orders = await prisma.orders.findMany({
      where: {
        origem: 'mercado_livre',
        tipo_envio: 'fulfillment',
        created_at: { gte: cutoff },
        status: { not: 'cancelado' },
      },
      select: {
        id: true,
        order_number: true,
        total: true,
        frete: true,
        recebimento_liquido: true,
        tipo_envio: true,
        comissao_seller_valor: true,
        bonus_cupom_valor: true,
        bonus_envio_valor: true,
        tarifa_pct_valor: true,
      },
      orderBy: { created_at: 'desc' },
      take: limit,
    })

    let atualizadas = 0
    const detalhes: any[] = []

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
        let sendersCost = 0
        if (shippingId) {
          try {
            const rCosts = await fetch(`https://api.mercadolibre.com/shipments/${shippingId}/costs?access_token=${tokenResult.token}`, { cache: 'no-store' })
            if (rCosts.ok) {
              const costs = await rCosts.json()
              const senders = costs.senders?.[0]
              sendersCost = Number(senders?.cost) || 0
            }
          } catch {}
        }

        // Para FULL: tarifa = 12% (sem fixo), frete = senders.cost, cupom = 12% - sale_fee
        const tarifaPct = round2(unitPrice * 0.12)
        const freteLiquido = round2(sendersCost)
        const cupomEstorno = round2(Math.max(0, tarifaPct - saleFee))
        const novoRecebimento = round2(Number(o.total) - tarifaPct - freteLiquido + cupomEstorno)

        await prisma.orders.update({
          where: { id: o.id },
          data: {
            frete: freteLiquido,
            recebimento_liquido: novoRecebimento,
            comissao_seller_valor: saleFee, // o que ML realmente desconta
            bonus_cupom_valor: cupomEstorno,
            tarifa_pct_valor: tarifaPct,
          },
        })

        atualizadas++
        detalhes.push({
          id: o.order_number,
          venda: Number(o.total),
          unit_price: unitPrice,
          sale_fee: saleFee,
          frete_old: Number(o.frete),
          frete_new: freteLiquido,
          tarifa_pct: tarifaPct,
          cupom_estorno: cupomEstorno,
          comissao_old: Number(o.comissao_seller_valor),
          comissao_new: saleFee,
          recebimento_old: Number(o.recebimento_liquido),
          recebimento_new: novoRecebimento,
        })
      } catch (err: any) {
        detalhes.push({ id: o.order_number, erro: err.message })
      }
    }

    return NextResponse.json({
      ok: true,
      total: orders.length,
      atualizadas,
      detalhes,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}