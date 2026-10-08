/**
 * Backfill PROFUNDO de cada order via /orders/{id} + /shipments/{id}:
 * - comissão REAL (sale_fee por item)
 * - frete REAL (shipping_options.cost ou shipping_cost)
 * - bônus/cupom (campaigns ML)
 * - data_created REAL do ML
 * - pagamento_id (não duplica)
 *
 * GET /api/admin/backfill-comissoes-real?secret=LUXO2026&dias=7&limit=200
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getMLToken } from '@/lib/ml-auth'

async function mlFetchLocal(accountId: string, path: string): Promise<any> {
  const tokenResult = await getMLToken()
  if (!tokenResult) throw new Error('Sem token ML')
  const token = tokenResult.token
  const url = `https://api.mercadolibre.com${path}${path.includes('?') ? '&' : '?'}access_token=${token}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`ML ${res.status}: ${await res.text()}`)
  return res.json()
}

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const secret = searchParams.get('secret')
  const authHeader = req.headers.get('authorization') || ''
  const isBasicAuth = authHeader.startsWith('Basic ')
  if (secret !== 'LUXO2026' && !isBasicAuth) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const dias = parseInt(searchParams.get('dias') || '7', 10)
  const limit = parseInt(searchParams.get('limit') || '200', 10)
  const dataLimite = new Date(Date.now() - dias * 24 * 3600 * 1000)

  // Busca orders ML recentes (ainda com payment_id pra extrair o ID real)
  const orders = await prisma.orders.findMany({
    where: {
      origem: 'mercado_livre',
      created_at: { gte: dataLimite },
      payment_id: { not: null },
    },
    orderBy: { created_at: 'desc' },
    take: limit,
  })

  // Conta LIURAESSENCE
  const account = await prisma.marketplace_accounts.findFirst({
    where: { nickname: 'LIURAESSENCE' },
  })
  if (!account) {
    return NextResponse.json({ ok: false, error: 'Conta ML não encontrada' }, { status: 500 })
  }

  let atualizados = 0
  let erros = 0
  let pulados = 0
  const detalhes: any[] = []

  // Concurrency 3 pra não bater rate limit
  const BATCH = 3
  for (let i = 0; i < orders.length; i += BATCH) {
    const batch = orders.slice(i, i + BATCH)
    await Promise.all(batch.map(async (o) => {
      try {
        const mlOrderId = o.payment_id // ML order ID (numérico)
        if (!mlOrderId || isNaN(Number(mlOrderId))) {
          pulados++
          return
        }

        // 1) Buscar order detail
        const orderDetail: any = await mlFetchLocal(account.id, `/orders/${mlOrderId}`)

        // 2) Comissão REAL = soma dos sale_fee * quantity
        let comissaoReal = 0
        for (const item of orderDetail.order_items || []) {
          const saleFee = Number(item.sale_fee || 0)
          const qty = Number(item.quantity || 1)
          comissaoReal += saleFee * qty
        }

// 3) Buscar shipment pra frete REAL + bonus
        let freteReal = Number(orderDetail.shipping_cost || 0)
        let bonusReal = 0
        const shippingId = orderDetail.shipping?.id
        if (shippingId) {
          try {
            const shipment: any = await mlFetchLocal(account.id, `/shipments/${shippingId}`)
            // FRETE REAL: priorizar shipping_option.list_cost (o que o ML mostra no painel)
            const opt = shipment?.shipping_option || shipment?.shipping_options
            const optCost = opt?.list_cost ?? opt?.cost
            const optCostNum = optCost != null ? Number(optCost) : null
            if (optCostNum != null && optCostNum > 0) {
              freteReal = optCostNum
            } else if (shipment?.shipping_cost != null) {
              freteReal = Number(shipment.shipping_cost)
            } else if (shipment?.base_cost != null) {
              freteReal = Number(shipment.base_cost)
            }
            // Bonus do shipment
            if (shipment?.coupon?.amount != null) {
              bonusReal = Number(shipment.coupon.amount)
            }
          } catch {}
        }

        // 4) Bonus do payment + bonus implícito (diferença entre 12% cheio e sale_fee)
        if (Array.isArray(orderDetail.payments)) {
          for (const p of orderDetail.payments) {
            if (p.coupon_amount && Number(p.coupon_amount) > 0) {
              bonusReal += Number(p.coupon_amount)
            }
          }
        }
        const tags = orderDetail.tags || []
        if (Array.isArray(tags) && tags.includes('order_has_discount')) {
          const tarifaCheia = orderDetail.order_items.reduce((s, it) => {
            return s + Number(it.unit_price || 0) * Number(it.quantity || 1) * 0.12
          }, 0)
          const bonusImplicito = Math.max(0, tarifaCheia - comissaoReal)
          if (bonusImplicito > bonusReal) bonusReal = bonusImplicito
        }

// 5) Calcular recebimento
        // IMPORTANTE: sale_fee do ML JÁ desconta o bônus implícito.
        // Então NÃO somamos bônus no cálculo final.
        const total = Number(orderDetail.total_amount || 0)
        const recebimento = Math.max(0, total - comissaoReal - freteReal)
        const taxaPct = total > 0 ? (comissaoReal / total) * 100 : 0

        // 6) Data real do ML (com timezone)
        const dataReal = orderDetail.date_created ? new Date(orderDetail.date_created) : null

        // 7) Atualizar
        await prisma.orders.update({
          where: { id: o.id },
          data: {
            comissao_seller_valor: comissaoReal,
            comissao_seller_pct: taxaPct,
            frete: freteReal,
            recebimento_liquido: recebimento,
            desconto: bonusReal > 0 ? bonusReal : null,
            ...(dataReal && { created_at: dataReal }),
          },
        })

        atualizados++
        detalhes.push({
          ml_order_id: mlOrderId,
          total,
          comissao_antiga: Number(o.comissao_seller_valor || 0),
          comissao_nova: comissaoReal,
          frete_antigo: Number(o.frete || 0),
          frete_novo: freteReal,
          bonus: bonusReal,
          recebimento,
        })
      } catch (err: any) {
        erros++
      }
    }))
  }

  return NextResponse.json({
    ok: true,
    total_processados: orders.length,
    atualizados,
    pulados,
    erros,
    amostra: detalhes.slice(0, 10),
  })
}

