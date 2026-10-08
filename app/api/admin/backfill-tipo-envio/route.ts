/**
 * Backfill tipo_envio pra orders existentes.
 * Pra cada order paga recente (últimos 30 dias) que ainda não tem tipo_envio,
 * consulta /shipments/{id} no ML e salva o logistic_type.
 *
 * GET /api/admin/backfill-tipo-envio?secret=LUXO2026&days=30&limit=200
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

  const days = Number(searchParams.get('days') || 30)
  const limit = Number(searchParams.get('limit') || 200)
  const t0 = Date.now()

  try {
    const since = new Date(Date.now() - days * 24 * 3600 * 1000)

    const orders = await prisma.orders.findMany({
      where: {
        origem: 'mercado_livre',
        created_at: { gte: since },
        tipo_envio: null, // só as que ainda não têm
      },
      orderBy: { created_at: 'desc' },
      take: limit,
      select: {
        id: true,
        order_number: true,
        marketplace_account_id: true,
        endereco_entrega: true, // contém shipping.id às vezes
      },
    })

    console.log(`[Backfill tipo_envio] ${orders.length} orders pra processar`)

    let atualizadas = 0
    let erros = 0
    const detalhes: any[] = []

    for (const o of orders) {
      try {
        const detail: any = await mlFetch(
          o.marketplace_account_id!,
          `/orders/${o.order_number}`
        )
        const shippingId = detail?.shipping?.id
        if (!shippingId) {
          detalhes.push({ id: o.order_number, status: 'no_shipping_id' })
          continue
        }
        const shipment: any = await mlFetch(o.marketplace_account_id!, `/shipments/${shippingId}`)
        const tipoEnvio = shipment?.logistic_type || null
        if (tipoEnvio) {
          await prisma.orders.update({
            where: { id: o.id },
            data: { tipo_envio: tipoEnvio },
          })
          atualizadas++
          detalhes.push({ id: o.order_number, tipo_envio: tipoEnvio })
        } else {
          detalhes.push({ id: o.order_number, status: 'no_logistic_type' })
        }
        // Pequeno delay pra não estourar rate limit
        await new Promise((r) => setTimeout(r, 100))
      } catch (err: any) {
        erros++
        detalhes.push({ id: o.order_number, error: err.message.slice(0, 100) })
      }
    }

    return NextResponse.json({
      ok: true,
      total: orders.length,
      atualizadas,
      erros,
      detalhes: detalhes.slice(0, 20), // só primeiros 20 pra não pesar
      duracao_ms: Date.now() - t0,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}