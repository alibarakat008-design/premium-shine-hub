/**
 * Backfill: pega pack_id de cada order via /orders/{id} no ML
 * Salva em orders.pack_id
 *
 * GET /api/admin/backfill-pack-id?secret=LUXO2026&days=30&limit=15
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
  const limit = Number(searchParams.get('limit') || 15)
  const t0 = Date.now()

  try {
    const since = new Date(Date.now() - days * 24 * 3600 * 1000)
    const orders = await prisma.orders.findMany({
      where: {
        origem: 'mercado_livre',
        created_at: { gte: since },
        pack_id: null,
      },
      orderBy: { created_at: 'desc' },
      take: limit,
      select: {
        id: true,
        order_number: true,
        marketplace_account_id: true,
      },
    })

    console.log(`[Backfill pack_id] ${orders.length} orders`)

    let atualizadas = 0
    let erros = 0
    const detalhes: any[] = []

    for (const o of orders) {
      try {
        const detail: any = await mlFetch(o.marketplace_account_id!, `/orders/${o.order_number}`)
        if (detail?.pack_id) {
          await prisma.orders.update({
            where: { id: o.id },
            data: { pack_id: String(detail.pack_id) },
          })
          atualizadas++
          detalhes.push({ id: o.order_number, pack_id: detail.pack_id })
        }
        await new Promise((r) => setTimeout(r, 100))
      } catch (err: any) {
        erros++
        detalhes.push({ id: o.order_number, error: err.message.slice(0, 80) })
      }
    }

    return NextResponse.json({
      ok: true,
      total: orders.length,
      atualizadas,
      erros,
      detalhes: detalhes.slice(0, 10),
      duracao_ms: Date.now() - t0,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}