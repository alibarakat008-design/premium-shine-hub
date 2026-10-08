// Backfill de order_items a partir dos orders que existem mas estão sem items.
// Aplica a estratégia: pra cada order sem items, busca detalhes na API do ML e salva items.
// Roda em chunks pra respeitar timeout do Vercel free (~10s).
//
// Uso: GET /api/admin/backfill-items?secret=LUXO2026&limit=50&skip=0
// Cada chamada processa até `limit` orders e retorna offset pra próxima.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

async function mlFetch(token: string, url: string) {
  const res = await fetch(`https://api.mercadolibre.com${url}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return res.json()
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  if (searchParams.get('secret') !== 'LUXO2026') {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const limit = Math.min(Number(searchParams.get('limit') || 50), 100)
  const skip = Number(searchParams.get('skip') || 0)
  const meses = Number(searchParams.get('meses') || 7) // últimos N meses

  try {
    const account = await prisma.marketplace_accounts.findFirst({ where: { nickname: 'LIURAESSENCE' } })
    if (!account) return NextResponse.json({ ok: false, error: 'Conta ML não encontrada' }, { status: 404 })
    const token = account.access_token!
    if (!token) return NextResponse.json({ ok: false, error: 'Token ML ausente — faça refresh' }, { status: 401 })

    // Pega orders SEM items, dentro da janela de meses
    const dataLimite = new Date()
    dataLimite.setMonth(dataLimite.getMonth() - meses)

    const orders = await prisma.orders.findMany({
      where: {
        origem: 'mercado_livre',
        created_at: { gte: dataLimite },
        order_items: { none: {} }, // só orders sem nenhum item
      },
      orderBy: { created_at: 'desc' },
      take: limit,
      skip,
    })

    if (orders.length === 0) {
      return NextResponse.json({
        ok: true,
        message: 'Nenhum order sem items na janela/offset atual',
        processed: 0,
        remaining: 0,
        next_skip: null,
      })
    }

    let processed = 0
    let itemsAdded = 0
    const errors: string[] = []

    for (const o of orders) {
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
          // Link com a conta ML (pra mostrar nickname na UI)
          await prisma.orders.update({
            where: { id: o.id },
            data: { marketplace_account_id: account.id },
          }).catch(() => {})
          processed++
        }
      } catch (err: any) {
        errors.push(`${o.order_number}: ${err.message?.substring(0, 100)}`)
      }
    }

    // Conta quanto falta
    const remaining = await prisma.orders.count({
      where: {
        origem: 'mercado_livre',
        created_at: { gte: dataLimite },
        order_items: { none: {} },
      },
    })

    return NextResponse.json({
      ok: true,
      batch_processed: processed,
      items_added: itemsAdded,
      errors: errors.length > 0 ? errors.slice(0, 5) : undefined,
      remaining,
      next_skip: remaining > 0 ? skip + limit : null,
      hint: remaining > 0
        ? `Faltam ~${remaining} orders. Continue chamando com ?skip=${skip + limit}&limit=${limit}`
        : '✅ Tudo processado!',
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message, stack: err.stack }, { status: 500 })
  }
}
