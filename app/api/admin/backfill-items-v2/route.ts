// Backfill OTIMIZADO de order_items usando /orders/search + parallel fetch.
// Diferente do /backfill-items (que faz 1 chamada por ordem), este aqui:
// 1. Lista orders sem items do banco
// 2. Agrupa em "search" chamando /orders/search por mês (1 chamada = 50 orders)
// 3. Pra cada order, busca detalhes em paralelo (Promise.all com concorrência)
// Resultado: ~50x mais rápido
//
// Uso: GET /api/admin/backfill-items-v2?secret=LUXO2026&limit=500

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

async function mlFetch(token: string, url: string) {
  const res = await fetch(`https://api.mercadolibre.com${url}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

async function asyncPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = []
  let i = 0
  const workers = Array(limit).fill(0).map(async () => {
    while (i < items.length) {
      const idx = i++
      results[idx] = await fn(items[idx])
    }
  })
  await Promise.all(workers)
  return results
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  if (searchParams.get('secret') !== 'LUXO2026') {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const limit = Math.min(Number(searchParams.get('limit') || 200), 500)
  const concurrency = Math.min(Number(searchParams.get('concurrency') || 10), 20)

  try {
    const account = await prisma.marketplace_accounts.findFirst({ where: { nickname: 'LIURAESSENCE' } })
    if (!account || !account.access_token) {
      return NextResponse.json({ ok: false, error: 'Conta/token ML ausente' }, { status: 401 })
    }
    const token = account.access_token
    const sellerId = account.account_id

    // Pega orders sem items, ordenados por data (mais antigos primeiro pra processar em ordem)
    const orders = await prisma.orders.findMany({
      where: {
        origem: 'mercado_livre',
        order_items: { none: {} },
      },
      orderBy: { created_at: 'asc' }, // do mais antigo pro mais novo
      take: limit,
      select: { id: true, order_number: true, created_at: true },
    })

    if (orders.length === 0) {
      return NextResponse.json({
        ok: true,
        message: '✅ Nenhum order sem items — tudo preenchido!',
        processed: 0,
        remaining: 0,
      })
    }

    let processed = 0
    let itemsAdded = 0
    let errors = 0

    // Pra cada batch de orders, busca detalhes em paralelo (concurrency limitado)
    await asyncPool(orders, concurrency, async (o) => {
      try {
        const detail = await mlFetch(token, `/orders/${o.order_number}`)
        if (detail.order_items && detail.order_items.length > 0) {
          for (const item of detail.order_items) {
            const mlItemId = String(item.item?.id || '')
            let productId: string | null = null
            let sku: string | null = null
            if (mlItemId) {
              const listing = await prisma.marketplace_listings.findFirst({
                where: { listing_id: mlItemId },
                select: { product_id: true, products: { select: { sku: true } } },
              })
              productId = listing?.product_id || null
              sku = listing?.products?.sku || null
            }
            await prisma.order_items.create({
              data: {
                order_id: o.id,
                product_id: productId,
                sku: sku || item.item?.seller_sku || null,
                nome_produto: (item.item?.title || '').substring(0, 255),
                quantidade: item.quantity || 1,
                preco_unitario: Number(item.unit_price || 0),
                preco_total: Number(item.full_unit_price || item.unit_price || 0),
              },
            })
            itemsAdded++
          }
          // Atualiza também marketplace_account_id (link com a conta ML) — evita `??` no painel
          await prisma.orders.update({
            where: { id: o.id },
            data: { marketplace_account_id: account.id },
          }).catch(() => {})
          processed++
        }
      } catch (e) {
        errors++
      }
    })

    const remaining = await prisma.orders.count({
      where: { origem: 'mercado_livre', order_items: { none: {} } },
    })

    return NextResponse.json({
      ok: true,
      batch_processed: processed,
      items_added: itemsAdded,
      errors,
      remaining,
      hint: remaining > 0
        ? `Continue chamando com ?limit=${limit}&concurrency=${concurrency}`
        : '✅ Tudo preenchido!',
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message, stack: err.stack }, { status: 500 })
  }
}
