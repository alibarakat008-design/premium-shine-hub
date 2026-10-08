/**
 * Backfill COMPLETO pra orders FLEX (tipo_envio='self_service'):
 * - Consulta /shipments/{id} pra cada uma
 * - Pega base_cost (custo real que vendedor paga ao carrier)
 * - Pega list_cost (custo fictício ML)
 * - Calcula bônus envio = base_cost - list_cost
 * - Atualiza:
 *     frete = 0
 *     custo_flex = base_cost
 *     recebimento_liquido = total - comissao_seller_valor + bonus_envio
 *
 * GET /api/admin/backfill-flex-completo?secret=LUXO2026&dry=1
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

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

  const dryRun = searchParams.get('dry') === '1'
  const t0 = Date.now()

  try {
    // Pega orders FLEX (com ou sem custo_flex já preenchido)
    const orders = await prisma.orders.findMany({
      where: {
        origem: 'mercado_livre',
        tipo_envio: 'self_service',
      },
      select: {
        id: true,
        order_number: true,
        total: true,
        comissao_seller_valor: true,
        frete: true,
        custo_flex: true,
        recebimento_liquido: true,
        marketplace_account_id: true,
      },
      take: 30,
      orderBy: { created_at: 'desc' },
    })

    console.log(`[Backfill flex completo] ${orders.length} orders FLEX`)

    const atualizacoes: any[] = []
    let atualizadas = 0
    let erros = 0

    for (const o of orders) {
      try {
        const detail: any = await mlFetch(o.marketplace_account_id!, `/orders/${o.order_number}`)
        const shippingId = detail?.shipping?.id
        if (!shippingId) {
          atualizacoes.push({ id: o.order_number, status: 'no_shipping_id' })
          continue
        }
        const shipment: any = await mlFetch(o.marketplace_account_id!, `/shipments/${shippingId}`)
        const baseCost = Number(shipment?.base_cost || 0)
        const listCost = Number(shipment?.shipping_option?.list_cost || 0)
        const bonusEnvio = baseCost > 0 && listCost > 0 ? Math.max(0, baseCost - listCost) : 0

        const novoRecebimento = Math.max(
          0,
          Number(o.total) - Number(o.comissao_seller_valor || 0) + bonusEnvio
        )

        const update = {
          frete: 0,
          // NÃO sobrescreve custo_flex — user paga R$13,90 ao carrier (não o base_cost do ML)
          // Deixa null pra vendas-recentes usar o padrão R$13,90
          recebimento_liquido: novoRecebimento,
        }

        if (!dryRun) {
          await prisma.orders.update({
            where: { id: o.id },
            data: update,
          })
          atualizadas++
        }

        atualizacoes.push({
          id: o.order_number,
          base_cost: baseCost,
          list_cost: listCost,
          bonus_envio: bonusEnvio,
          novo_recebimento: novoRecebimento,
          ...update,
        })

        await new Promise((r) => setTimeout(r, 80))
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
      exemplos: atualizacoes.slice(0, 10),
      duracao_ms: Date.now() - t0,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}