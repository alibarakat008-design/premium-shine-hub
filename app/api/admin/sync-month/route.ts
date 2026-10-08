// Endpoint pra sincronizar orders de 1 mês específico (YYYY-MM)
// IMPORTANTE: o /orders/search do ML só aceita order.status=paid ou order.status=cancelled
// As outras (handling, ready_to_ship, etc) NÃO são filtros válidos
// TODAS as orders pagas retornam como status=paid
//
// Filtro por mês usa date_closed (que é igual a date_created na prática pra orders pagas)
// Pra pegar histórico paginamos com offset

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

export async function POST(req: NextRequest) {
  console.log('SYNC-MONTH: starting')
  try {
    const { searchParams } = new URL(req.url)
    const mesParam = searchParams.get('mes')
    const maxPagesParam = searchParams.get('max_pages')
    const startOffsetParam = searchParams.get('offset')
    const startOffset = startOffsetParam ? Number(startOffsetParam) : 0
    const maxPages = maxPagesParam ? Math.min(Number(maxPagesParam), 30) : 30 // máximo de páginas por chamada
    console.log('SYNC-MONTH: params', { mesParam, maxPages, startOffset })

    if (!mesParam) {
      return NextResponse.json({ ok: false, error: 'Informe ?mes=YYYY-MM' }, { status: 400 })
    }
    const [y, m] = mesParam.split('-').map(Number)
    if (!y || !m || m < 1 || m > 12) {
      return NextResponse.json({ ok: false, error: 'Mês inválido (use YYYY-MM)' }, { status: 400 })
    }

    const account = await prisma.marketplace_accounts.findFirst({
      where: { nickname: 'LIURAESSENCE' },
    })
    if (!account) return NextResponse.json({ ok: false, error: 'Conta não encontrada' }, { status: 404 })
    const company = await prisma.companies.findFirst({ where: { ativa: true } })
      || await prisma.companies.findFirst()
    if (!company) return NextResponse.json({ ok: false, error: 'Company não encontrada' }, { status: 404 })
    const token = account.access_token!

    const from = new Date(y, m - 1, 1)
    const to = new Date(y, m, 1)
    const dateFrom = from.toISOString()
    const dateTo = to.toISOString()

    let totalCreated = 0
    let totalUpdated = 0
    let totalSkipped = 0
    let totalEnderecos = 0
    let monthOffset = startOffset
    const limit = 50

    // Só order.status=paid é aceito (canceladas são outro endpoint)
    const url_base = `/orders/search?seller=${account.account_id}&order.status=paid&order.date_closed.from=${dateFrom}&order.date_closed.to=${dateTo}&limit=${limit}&sort=date_desc`

    while (true) {
      const url = url_base + `&offset=${monthOffset}`
      let search
      try {
        search = await mlFetch(token, url)
      } catch (e: any) {
        return NextResponse.json({ ok: false, error: e.message, partial: { totalCreated, totalUpdated, totalSkipped } }, { status: 500 })
      }

      const results = search.results || []
      if (results.length === 0) break

      // Coletar orders novas (não existentes) em batch
      const toCreate: any[] = []
      for (const o of results) {
        const mlOrderId = String(o.id || '').trim()
        if (!mlOrderId) continue
        ;(o as any)._mlId = mlOrderId
        toCreate.push(o)
      }
      if (toCreate.length === 0) {
        monthOffset += limit
        if (results.length < limit) break
        continue
      }

      // Buscar todas que já existem (1 query)
      const ids = toCreate.map((o: any) => (o as any)._mlId)
      let existingSet = new Set<string>()
      try {
        const existingList = await prisma.orders.findMany({
          where: { order_number: { in: ids } },
          select: { order_number: true },
        })
        existingSet = new Set(existingList.map((e) => e.order_number))
      } catch (e: any) {
        console.error('findMany error:', e.message)
      }

      const statusMap: any = {
        paid: 'confirmado',
        confirmed: 'confirmado',
        handling: 'separado',
        ready_to_ship: 'separado',
        shipped: 'enviado',
        delivered: 'entregue',
        cancelled: 'cancelado',
        not_paid: 'pendente',
      }

      // Filtrar só as novas e preparar batch
      const newOrders: any[] = []
      for (const o of toCreate) {
        const mlId = (o as any)._mlId
        if (existingSet.has(mlId)) {
          totalUpdated++
          continue
        }
        const total = Number(o.total_amount || 0)
        const status = String(o.status || '').toLowerCase()
        const dataFechado = o.date_closed ? new Date(o.date_closed) : null
        const dataCriado = o.date_created ? new Date(o.date_created) : new Date()
        const nossoStatus = statusMap[status] || 'confirmado'
        const dataVenda = dataFechado || dataCriado
        newOrders.push({
          order_number: mlId,
          total,
          subtotal: total,
          origem: 'mercado_livre',
          status: nossoStatus,
          company_id: company.id,
          created_at: dataVenda,
          updated_at: new Date(),
        })
      }

      // Insert em batch (muito mais rápido)
      if (newOrders.length > 0) {
        try {
          const result = await prisma.orders.createMany({
            data: newOrders,
            skipDuplicates: true,
          })
          // result.count = quantas foram realmente inseridas
          const inserted = (result as any).count || newOrders.length
          totalCreated += inserted

          // Backfill: busca o receiver_address do ML pra cada order nova
          // Pra evitar timeout do Vercel, faz em chunks de 5
          if (process.env.ENABLE_ADDRESS_BACKFILL !== 'false') {
            const BATCH_SIZE = 5
            let enderecosExtraidos = 0
            for (let i = 0; i < newOrders.length; i += BATCH_SIZE) {
              const chunk = newOrders.slice(i, i + BATCH_SIZE)
              await Promise.all(chunk.map(async (no) => {
                try {
                  const r = await fetch(`https://api.mercadolibre.com/orders/${no.order_number}`, {
                    headers: { Authorization: `Bearer ${account.access_token}` },
                  })
                  if (!r.ok) return
                  const detail = await r.json()
                  const addr = detail.receiver_address
                  if (addr) {
                    await prisma.orders.update({
                      where: { order_number: no.order_number },
                      data: {
                        endereco_entrega: {
                          uf: addr.state?.id || null,
                          estado: addr.state?.name || null,
                          cidade: addr.city?.name || null,
                          bairro: addr.neighborhood?.name || null,
                          cep: addr.zip_code || null,
                          rua: addr.street_name || null,
                          numero: addr.street_number || null,
                          complemento: addr.comment || null,
                          lat: addr.latitude || null,
                          lng: addr.longitude || null,
                        },
                      },
                    })
                    enderecosExtraidos++
                  }
                } catch { /* ignora falha individual */ }
              }))
            }
            totalEnderecos += enderecosExtraidos
          }
        } catch (err: any) {
          console.error('Batch insert error:', err.message?.slice(0, 200))
          totalSkipped += newOrders.length
        }
      }

      // Incrementa offset
      const nextOffset = monthOffset + limit

      // Se processou max_pages páginas, para
      if ((nextOffset - startOffset) / limit >= maxPages) {
        return NextResponse.json({
          ok: true,
          mes: mesParam,
          status: 'continua',
          message: `Parou em offset ${nextOffset}, chame de novo para continuar`,
          criadas: totalCreated,
          atualizadas: totalUpdated,
          erros: totalSkipped,
          enderecos_extraidos: totalEnderecos,
          last_offset: nextOffset,
          tem_mais: true,
        })
      }

      monthOffset = nextOffset
      if (results.length < limit) break
      if (monthOffset > 5000) break
    }

    return NextResponse.json({
      ok: true,
      mes: mesParam,
      criadas: totalCreated,
      atualizadas: totalUpdated,
      erros: totalSkipped,
      enderecos_extraidos: totalEnderecos,
      last_offset: monthOffset,
      tem_mais: false,
    })
  } catch (err: any) {
    console.error('SYNC-MONTH FATAL:', err.message, err.stack)
    return NextResponse.json({ ok: false, error: err.message, stack: err.stack }, { status: 500 })
  }
}
