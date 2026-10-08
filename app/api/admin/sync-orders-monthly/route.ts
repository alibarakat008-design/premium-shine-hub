// Endpoint pra disparar sync de orders via Vercel (que tem acesso à internet)
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60 // 1 min (Vercel free)

async function mlFetch(token: string, url: string) {
  const res = await fetch(`https://api.mercadolibre.com${url}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return res.json()
}

export async function POST(req: NextRequest) {
  try {
    const account = await prisma.marketplace_accounts.findFirst({
      where: { nickname: 'LIURAESSENCE' },
    })
    if (!account) return NextResponse.json({ ok: false, error: 'Conta não encontrada' }, { status: 404 })
    const company = await prisma.companies.findFirst({ where: { ativa: true } })
      || await prisma.companies.findFirst()
    if (!company) return NextResponse.json({ ok: false, error: 'Company não encontrada' }, { status: 404 })
    const token = account.access_token!

    const now = new Date()
    const months: { from: Date; to: Date; label: string }[] = []
    for (let i = 6; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1)
      months.push({ from: start, to: end, label: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}` })
    }

    let totalCreated = 0
    let totalUpdated = 0
    let totalSkipped = 0
    const monthResults: any[] = []

    for (const month of months) {
      const dateFrom = month.from.toISOString()
      const dateTo = month.to.toISOString()
      let monthOffset = 0
      const limit = 50
      let monthCount = 0
      let monthCreated = 0
      let monthUpdated = 0
      let monthSkipped = 0

      while (true) {
        const url = `/orders/search?seller=${account.account_id}&order.status=paid&order.status=confirmed&order.status=delivered&order.status=shipped&order.date_closed.from=${dateFrom}&order.date_closed.to=${dateTo}&limit=${limit}&offset=${monthOffset}&sort=date_desc`
        let search
        try {
          search = await mlFetch(token, url)
        } catch (e: any) {
          console.log(`Sync erro: ${e.message}`)
          break
        }

        const results = search.results || []
        if (results.length === 0) break
        monthCount += results.length

        for (const o of results) {
          try {
            const mlOrderId = String(o.id)
            const orderDetail = await mlFetch(token, `/orders/${mlOrderId}`)
            const total = Number(orderDetail.total_amount || 0)
            const status = (orderDetail.status || '').toLowerCase()
            const dataAprovado = orderDetail.date_approved ? new Date(orderDetail.date_approved) : null
            const dataFechado = orderDetail.date_closed ? new Date(orderDetail.date_closed) : null
            const dataCriado = orderDetail.date_created ? new Date(orderDetail.date_created) : new Date()
            const statusMap: any = { paid: 'confirmado', confirmed: 'confirmado', handling: 'separado', ready_to_ship: 'separado', shipped: 'enviado', delivered: 'entregue', cancelled: 'cancelado', not_paid: 'pendente' }
            const nossoStatus = statusMap[status] || 'pendente'

            const existing = await prisma.orders.findFirst({ where: { order_number: mlOrderId } })
            let orderDbId: string
            if (existing) {
              orderDbId = existing.id
              await prisma.orders.update({
                where: { id: existing.id },
                data: {
                  total,
                  status: nossoStatus,
                  marketplace_account_id: account.id, // link com a conta ML
                  updated_at: new Date(),
                },
              })
              totalUpdated++
              monthUpdated++
            } else {
              const dataVenda = dataFechado || dataAprovado || dataCriado
              const newOrder = await prisma.orders.create({
                data: {
                  order_number: mlOrderId,
                  total,
                  subtotal: total,
                  origem: 'mercado_livre',
                  status: nossoStatus,
                  company_id: company.id,
                  marketplace_account_id: account.id,
                  created_at: dataVenda,
                  updated_at: new Date(),
                },
              })
              orderDbId = newOrder.id
              totalCreated++
              monthCreated++
            }

            // Items
            if (orderDetail.order_items && orderDetail.order_items.length > 0) {
              await prisma.order_items.deleteMany({ where: { order_id: orderDbId } })
              for (const item of orderDetail.order_items) {
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
                // Salva SEMPRE o item, mesmo sem product_id — pra mostrar nome/sku/quantidade na UI
                await prisma.order_items.create({
                  data: {
                    order_id: orderDbId,
                    product_id: productId, // pode ser null
                    sku: sku || (item.item?.seller_sku || null),
                    nome_produto: (item.item?.title || '').substring(0, 255),
                    quantidade: item.quantity || 1,
                    preco_unitario: Number(item.unit_price || 0),
                    preco_total: Number(item.full_unit_price || item.unit_price || 0),
                  },
                })
              }
            }
          } catch (err: any) {
            totalSkipped++
            monthSkipped++
          }
        }

        monthOffset += limit
        if (results.length < limit) break
        if (monthOffset > 1500) break
      }

      monthResults.push({
        mes: month.label,
        total_encontradas: monthCount,
        criadas: monthCreated,
        atualizadas: monthUpdated,
        erros: monthSkipped,
      })
      console.log(`Sync ${month.label}: ${monthCount} encontradas, ${monthCreated} criadas`)
    }

    return NextResponse.json({
      ok: true,
      total_created: totalCreated,
      total_updated: totalUpdated,
      total_skipped: totalSkipped,
      por_mes: monthResults,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message, stack: err.stack }, { status: 500 })
  }
}
