/**
 * Backfill UNIVERSAL: recalcula recebimento_liquido + bonus_envio pra TODAS as orders ML
 * (não só FLEX). Pra cada order:
 *   - Consulta /orders/{id} → pega sale_fee
 *   - Consulta /shipments/{id} → pega base_cost, list_cost
 *   - Calcula bonus_envio = base_cost - list_cost (se houver)
 *   - Atualiza: recebimento_liquido = total - sale_fee + bonus_envio
 *               bonus_envio_valor = bonus_envio
 *
 * GET /api/admin/backfill-bonus-envio-all?secret=LUXO2026&days=30&limit=50
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const mlFetch = async (accountId: string, path: string): Promise<any> => {
  const account = await prisma.marketplace_accounts.findUnique({ where: { id: accountId } })
  if (!account) throw new Error('Conta não encontrada')
  const res = await fetch(`https://api.mercadolibre.com${path}`, {
    headers: { Authorization: `Bearer ${account.access_token}` },
  })
  if (!res.ok) throw new Error(`ML ${res.status}`)
  return res.json()
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || ''
  const { searchParams } = new URL(req.url)
  const secret = searchParams.get('secret')
  if (secret !== 'LUXO2026' && !authHeader.startsWith('Basic ')) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const days = Number(searchParams.get('days') || 30)
  const limit = Number(searchParams.get('limit') || 50)
  const dryRun = searchParams.get('dry') === '1'
  const t0 = Date.now()

  try {
    const since = new Date(Date.now() - days * 24 * 3600 * 1000)
    const orders = await prisma.orders.findMany({
      where: {
        origem: 'mercado_livre',
        created_at: { gte: since },
        // Só pega vendas que ainda não têm bonus_envio calculado
        bonus_envio_valor: null,
      },
      orderBy: { created_at: 'desc' },
      take: limit,
      select: {
        id: true,
        order_number: true,
        total: true,
        comissao_seller_valor: true,
        frete: true,
        recebimento_liquido: true,
        marketplace_account_id: true,
      },
    })

    console.log(`[Backfill bonus_envio all] ${orders.length} orders ML`)

    const atualizacoes: any[] = []
    let atualizadas = 0
    let erros = 0

    for (const o of orders) {
      try {
        const detail: any = await mlFetch(o.marketplace_account_id!, `/orders/${o.order_number}`)
        const shippingId = detail?.shipping?.id
        let bonusEnvio = 0
        if (shippingId) {
          try {
            const shipment: any = await mlFetch(o.marketplace_account_id!, `/shipments/${shippingId}`)
            const baseCost = Number(shipment?.base_cost || 0)
            const listCost = Number(shipment?.shipping_option?.list_cost || 0)
            bonusEnvio = baseCost > 0 && listCost > 0 ? Math.max(0, baseCost - listCost) : 0
          } catch {
            // sem shipment, bonusEnvio fica 0
          }
        }
        const novoRecebimento = Math.max(
          0,
          Number(o.total) - Number(o.comissao_seller_valor || 0) + bonusEnvio
        )
        const mudanca = Math.abs(novoRecebimento - Number(o.recebimento_liquido || 0)) > 0.01

        if (mudanca && !dryRun) {
          await prisma.orders.update({
            where: { id: o.id },
            data: {
              recebimento_liquido: novoRecebimento,
              bonus_envio_valor: bonusEnvio > 0 ? bonusEnvio : null,
            },
          })
          atualizadas++
        }

        atualizacoes.push({
          id: o.order_number,
          bonus_envio: bonusEnvio,
          recebimento_antigo: Number(o.recebimento_liquido || 0),
          recebimento_novo: novoRecebimento,
          mudou: mudanca,
        })

        await new Promise((r) => setTimeout(r, 100))
      } catch (err: any) {
        erros++
        atualizacoes.push({ id: o.order_number, error: err.message.slice(0, 100) })
      }
    }

    return NextResponse.json({
      ok: true,
      dryRun,
      total: orders.length,
      atualizadas,
      erros,
      exemplos: atualizacoes.slice(0, 15),
      duracao_ms: Date.now() - t0,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}