/**
 * SHOPIE PLUGIN WEBHOOK: recebe notificações em tempo real
 *
 * Shopee push notification:
 * - order_status_update
 * - order_tracking_update
 * - shop_authorization
 *
 * Documentação: https://open.shopee.com/documents?module=92&type=2
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

interface ShopeeWebhookBody {
  code: number
  data: {
    orders?: Array<{
      order_sn: string
      order_status: string
      update_time: number
    }>
    shop_id?: number
    auth_status?: string
  }
  msg?: string
  request_id?: string
}

export async function POST(req: NextRequest) {
  try {
    const body: ShopeeWebhookBody = await req.json()
    const signature = req.headers.get('authorization') || ''

    if (body.code !== 0) {
      return NextResponse.json({ ok: false, error: body.msg || 'Webhook error' }, { status: 400 })
    }

    // Processa orders
    if (body.data?.orders) {
      for (const order of body.data.orders) {
        // TODO: implementar upsert da venda no DB
        console.log(`[Shopee Webhook] Order ${order.order_sn} → ${order.order_status} @ ${order.update_time}`)
      }
    }

    // Processa shop auth
    if (body.data?.auth_status) {
      console.log(`[Shopee Webhook] Shop ${body.data.shop_id} auth → ${body.data.auth_status}`)
    }

    return NextResponse.json({ ok: true, processed: body.data?.orders?.length || 0 })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}
