/**
 * Backfill ML — busca todos os detalhes de cada order:
 * - total_amount → total (já existe)
 * - transaction_amount → recebimento_liquido (NOVO)
 * - sale_fee por item → comissao_seller_valor
 * - shipping.cost_by_seller → frete
 *
 * Garantia: total = comissao + frete + recebimento + ajustes
 *
 * GET /api/admin/backfill-ml-commissions?secret=LUXO2026&dias=180&batch=100&offset=0
 */
import { NextResponse } from 'next/server'
import { getMLToken } from '@/lib/ml-auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

interface MLOrderDetail {
  id: number
  total_amount: number
  transaction_amount?: number
  paid_amount?: number
  payments?: Array<{
    transaction_amount?: number
    total_paid_amount?: number
    shipping_cost?: number
    marketplace_fee?: number
    status?: string
    payment_method_id?: string
  }>
  shipping?: {
    cost?: number
    cost_by_seller?: number
    cost_by_buyer?: number
  }
  order_items?: Array<{
    sale_fee?: number
    unit_price?: number
    quantity?: number
  }>
}

async function fetchOrderFromML(orderNumber: string, mlToken: string): Promise<MLOrderDetail | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const url = `https://api.mercadolibre.com/orders/${orderNumber}?access_token=${mlToken}`
      const r = await fetch(url, { headers: { 'User-Agent': 'premium-shine/1.0' } })
      if (r.status === 429) {
        await new Promise((res) => setTimeout(res, 1500))
        continue
      }
      if (r.status === 404) return null
      if (!r.ok) return null
      return (await r.json()) as MLOrderDetail
    } catch {
      await new Promise((res) => setTimeout(res, 500))
    }
  }
  return null
}

/**
 * Extrai comissão, frete e calcula recebimento:
 * - total_amount = valor de venda (preço cheio do produto)
 * - payments[0].total_paid_amount = valor PAGO pelo cliente (inclui frete se Mercado Envios pago)
 * - comissao = sale_fee dos itens (se > 5%) ou 12% × total
 * - frete = max(shipping.cost_by_seller, total_paid_amount - total_amount)
 *   (cobre tanto frete Mercado Envios pago pelo vendedor quanto frete pago pelo cliente)
 * - recebimento = total - comissão - frete
 */
function calcularValores(detail: MLOrderDetail, totalVenda: number) {
  // Comissão: usar sale_fee dos itens se > 0, senão 12%
  let comissaoTotal = 0
  if (detail.order_items?.length) {
    for (const item of detail.order_items) {
      comissaoTotal += Number(item.sale_fee || 0)
    }
  }
  const taxaImplicita = totalVenda > 0 ? (comissaoTotal / totalVenda) * 100 : 0
  if (taxaImplicita < 5) {
    comissaoTotal = Number((totalVenda * 0.12).toFixed(2))
  }

  // Frete: tenta várias fontes em ordem de prioridade
  // 1) shipping.cost_by_seller (custo pago pelo vendedor)
  // 2) shipping.cost (custo total do envio)
  // 3) diferença entre total_paid_amount (cliente pagou) e total_amount (venda)
  //    (essa diferença é o frete Mercado Envios se o cliente pagou)
  const shippingCostBySeller = Number(detail.shipping?.cost_by_seller ?? 0)
  const shippingCost = Number(detail.shipping?.cost ?? 0)
  const totalPaidAmount = Number(
    detail.payments?.[0]?.total_paid_amount ??
    detail.payments?.[0]?.transaction_amount ??
    detail.paid_amount ??
    0
  )
  const fretePorDiferenca = Math.max(0, totalPaidAmount - totalVenda)

  const frete = Math.max(shippingCostBySeller, shippingCost, fretePorDiferenca)

  // Recebimento líquido
  const recebimentoLiquido = Number((totalVenda - comissaoTotal - frete).toFixed(2))

  // Taxa efetiva
  const taxaEfetiva = totalVenda > 0 ? (comissaoTotal / totalVenda) * 100 : 0

  return {
    comissao: Number(comissaoTotal.toFixed(2)),
    frete: Number(frete.toFixed(2)),
    recebimento: Math.max(0, recebimentoLiquido),
    taxaEfetiva: Number(taxaEfetiva.toFixed(2)),
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    if (searchParams.get('secret') !== 'LUXO2026') {
      return NextResponse.json({ ok: false, error: 'secret inválido' }, { status: 401 })
    }

    const dias = parseInt(searchParams.get('dias') || '180')
    const batch = parseInt(searchParams.get('batch') || '100')
    const offset = parseInt(searchParams.get('offset') || '0')

    const inicio = new Date(Date.now() - dias * 24 * 3600 * 1000)

    // Total no período
    const total = await prisma.orders.count({
      where: { origem: 'mercado_livre', created_at: { gte: inicio } },
    })

    // Token ML
    const tokenResult = await getMLToken()
    if (!tokenResult?.token) {
      return NextResponse.json({ ok: false, error: 'Token ML indisponível' }, { status: 500 })
    }
    const mlToken = tokenResult.token

    // Pega orders que AINDA não têm recebimento_liquido preenchido
    const orders = await prisma.orders.findMany({
      where: {
        origem: 'mercado_livre',
        created_at: { gte: inicio },
        marketplace_account_id: { not: null },
        recebimento_liquido: null,
      },
      select: {
        id: true,
        order_number: true,
        total: true,
      },
      orderBy: { created_at: 'desc' },
      take: batch,
      skip: offset,
    })

    console.log(`[backfill] Processando ${orders.length} orders (offset=${offset})`)

    let atualizadas = 0
    let naoEncontradas = 0
    let totalComissao = 0
    let totalFrete = 0
    let totalRecebimento = 0
    let usouFallback12 = 0

    // Processa sequencialmente pra evitar 429 do ML
    for (const o of orders) {
      const detail = await fetchOrderFromML(o.order_number || '', mlToken)
      if (!detail) {
        naoEncontradas++
        continue
      }

      const totalVenda = Number(detail.total_amount || o.total)

      // Calcula comissão, frete e recebimento
      const taxaImplicita = (detail.order_items?.reduce((s, it) => s + Number(it.sale_fee || 0), 0) || 0) / Math.max(totalVenda, 1) * 100
      const calc = calcularValores(detail, totalVenda)
      if (taxaImplicita < 5) usouFallback12++

      await prisma.orders.update({
        where: { id: o.id },
        data: {
          comissao_seller_pct: calc.taxaEfetiva,
          comissao_seller_valor: calc.comissao,
          frete: calc.frete,
          recebimento_liquido: calc.recebimento,
        },
      })

      atualizadas++
      totalComissao += calc.comissao
      totalFrete += calc.frete
      totalRecebimento += calc.recebimento

      // Pausa leve pra não saturar rate limit
      await new Promise((r) => setTimeout(r, 50))
    }

    // Stats globais
    const comRecebimento = await prisma.orders.count({
      where: { origem: 'mercado_livre', recebimento_liquido: { not: null } },
    })
    const semRecebimento = total - comRecebimento

    return NextResponse.json({
      ok: true,
      progresso: {
        processadas_neste_batch: orders.length,
        atualizadas,
        nao_encontradas_ml: naoEncontradas,
      },
      totais_neste_batch: {
        comissao: Number(totalComissao.toFixed(2)),
        frete: Number(totalFrete.toFixed(2)),
        recebimento: Number(totalRecebimento.toFixed(2)),
      },
      global: {
        total_orders_ml: total,
        com_recebimento_salvo: comRecebimento,
        sem_recebimento: semRecebimento,
        pct_completo: total > 0 ? Math.round((comRecebimento / total) * 100) : 0,
      },
      proximo_offset: offset + orders.length,
      has_more: offset + orders.length < semRecebimento,
      mensagem: offset + orders.length >= semRecebimento
        ? '🎉 Backfill concluído!'
        : `Faltam ~${semRecebimento - (offset + orders.length)} orders. Rode com offset=${offset + orders.length}`,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message, stack: err.stack }, { status: 500 })
  }
}
