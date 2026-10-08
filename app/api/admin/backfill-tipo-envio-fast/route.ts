/**
 * Backfill tipo_envio OTIMIZADO: busca tipo_envio de orders sem,
 * em PARALELO (5 vendas simultâneas) pra acelerar o processo.
 *
 * GET /api/admin/backfill-tipo-envio-fast?days=120&limit=200&parallel=5
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const mlFetch = async (accountId: string, path: string): Promise<any> => {
  const account = await prisma.marketplace_accounts.findUnique({ where: { id: accountId } })
  if (!account) throw new Error('Conta não encontrada')
  const res = await fetch(`https://api.mercadolibre.com${path}`, {
    headers: { Authorization: `Bearer ${account.access_token}` },
  })
  if (!res.ok) throw new Error(`ML ${res.status}`)
  return res.json()
}

async function processOne(o: any) {
  try {
    const detail: any = await mlFetch(o.marketplace_account_id!, `/orders/${o.order_number}`)
    const shippingId = detail?.shipping?.id
    if (!shippingId) return { id: o.order_number, status: 'no_shipping_id' }
    const shipment: any = await mlFetch(o.marketplace_account_id!, `/shipments/${shippingId}`)
    const tipoEnvio = shipment?.logistic_type || null
    if (tipoEnvio) {
      await prisma.orders.update({ where: { id: o.id }, data: { tipo_envio: tipoEnvio } })
      return { id: o.order_number, tipo_envio: tipoEnvio, ok: true }
    }
    return { id: o.order_number, status: 'no_logistic_type' }
  } catch (err: any) {
    return { id: o.order_number, error: err.message?.slice(0, 100) || String(err), ok: false }
  }
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || ''
  const { searchParams } = new URL(req.url)
  const secret = searchParams.get('secret')
  if (secret !== 'LUXO2026' && !authHeader.startsWith('Basic ')) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }
  const days = Number(searchParams.get('days') || 120)
  const limit = Number(searchParams.get('limit') || 200)
  const parallel = Math.min(10, Math.max(1, Number(searchParams.get('parallel') || 5)))
  const t0 = Date.now()

  try {
    const since = new Date(Date.now() - days * 24 * 3600 * 1000)
    const orders = await prisma.orders.findMany({
      where: { origem: 'mercado_livre', created_at: { gte: since }, tipo_envio: null },
      orderBy: { created_at: 'desc' },
      take: limit,
      select: { id: true, order_number: true, marketplace_account_id: true },
    })
    console.log(`[Backfill fast] ${orders.length} orders, parallel=${parallel}`)

    const resultados: any[] = []
    let i = 0
    while (i < orders.length) {
      const slice = orders.slice(i, i + parallel)
      const r = await Promise.all(slice.map(processOne))
      resultados.push(...r)
      i += parallel
    }

    const atualizadas = resultados.filter((r) => r.ok).length
    const erros = resultados.filter((r) => !r.ok && r.error).length
    return NextResponse.json({
      ok: true,
      total: orders.length,
      atualizadas,
      erros,
      duracao_ms: Date.now() - t0,
      amostra: resultados.slice(0, 20),
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}