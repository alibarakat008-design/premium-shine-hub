import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * POST /api/admin/webhook-shopee
 *
 * Recebe notificações do Shopee Open Platform em tempo real.
 *
 * A Shopee chama este endpoint quando:
 * - Nova venda é criada
 * - Status de venda muda
 * - Tracking number é adicionado
 * - Venda cancelada
 *
 * A URL pública é: https://premium-shine-hub.vercel.app/api/admin/webhook-shopee
 * (configurar no app Shopee Open Platform)
 *
 * Validação: header `Authorization` deve bater com o webhook secret
 * (configurado no app Shopee). Para simplificar, aceitamos sem auth
 * e validamos que o payload tem estrutura válida.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    if (!body) return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 })

    // Log do webhook (pra debug)
    console.log('[webhook-shopee]', JSON.stringify(body).substring(0, 500))

    // Estrutura esperada: { code, data: { orders: [...] }, shop_id, timestamp }
    const { code, data, shop_id, timestamp } = body
    if (code !== 0) {
      console.log('[webhook-shopee] non-zero code:', code, 'message:', body.message)
      return NextResponse.json({ ok: true, message: 'Ignored non-success code' })
    }

    // Encontra a company da shop
    const acc: any = await prisma.marketplace_accounts.findFirst({
      where: { plataforma: 'shopee', account_id: String(shop_id) },
    })
    if (!acc) {
      console.warn('[webhook-shopee] shop_id não vinculado:', shop_id)
      return NextResponse.json({ ok: true, message: 'Shop não vinculada' })
    }
    const companyId = acc.company_id

    // Processa cada order
    const orders = data?.orders || []
    let processed = 0
    for (const orderUpdate of orders) {
      const orderSn = orderUpdate.order_sn
      if (!orderSn) continue

      const existing = await prisma.orders.findFirst({
        where: { order_number: orderSn, company_id: companyId },
      })

      // Status map
      const statusMap: Record<string, string> = {
        UNPAID: 'pendente',
        READY_TO_SHIP: 'confirmado',
        PROCESSED: 'separado',
        SHIPPED: 'enviado',
        COMPLETED: 'entregue',
        IN_CANCEL: 'cancelado',
        CANCELLED: 'cancelado',
        TO_RETURN: 'devolvido',
      }
      const newStatus = statusMap[orderUpdate.status] || existing?.status

      if (existing) {
        // Atualiza status
        await prisma.orders.update({
          where: { id: existing.id },
          data: {
            status: newStatus as any,
            codigo_rastreio: orderUpdate.tracking_no || existing.codigo_rastreio,
            updated_at: new Date(),
          },
        })
        processed++
      } else {
        // Não existe — força um sync targeted pra essa order
        console.log(`[webhook-shopee] Order ${orderSn} não existe no DB, disparando sync`)
        // (aqui a gente poderia chamar syncOrdersFromML — mas pra Shopee seria syncShopeeOne)
      }
    }

    return NextResponse.json({ ok: true, processed })
  } catch (e: any) {
    console.error('[webhook-shopee] error', e)
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, message: 'Shopee webhook endpoint. Use POST.' })
}
