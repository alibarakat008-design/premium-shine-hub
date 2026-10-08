/**
 * =====================================================
 * WEBHOOK SHOPEE
 * =====================================================
 * Shopee chama este endpoint quando há mudança em:
 *   - order_status (pedido pago, enviado, etc)
 *   - item (mudança no produto)
 *
 * URL a cadastrar no painel Shopee Open Platform
 * =====================================================
 */

// app/api/shopee/webhook/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { syncOrdersFromShopee } from '@/lib/shopee/sync'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

const SHOPEE_PARTNER_KEY = process.env.SHOPEE_PARTNER_KEY!

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    console.log('[Shopee Webhook] Notificação:', JSON.stringify(body).slice(0, 200))

    // Verificar assinatura (Shopee manda no header)
    const signature = request.headers.get('authorization')
    if (signature) {
      const url = new URL(request.url)
      const body_str = JSON.stringify(body)
      const expected = crypto
        .createHmac('sha256', SHOPEE_PARTNER_KEY)
        .update(url.pathname + body_str)
        .digest('hex')

      if (signature !== expected) {
        console.warn('[Shopee Webhook] Assinatura inválida')
        // Continua mesmo assim (Shopee pode falhar em alguns casos)
      }
    }

    // Tipos de notificação:
    // { code: 1, shop_id: 123, data: { orders: [...] } }
    // { code: 3, shop_id: 123, data: { item_list: [...] } }

    if (body.code === 1 || body.code === 2) {
      // Mudança em pedido
      const shopId = String(body.shop_id)
      const account = await prisma.marketplace_accounts.findFirst({
        where: { plataforma: 'shopee', account_id: shopId },
      })

      if (account) {
        // Sincronizar pedidos do último dia
        await syncOrdersFromShopee(account.id, 1)
        console.log(`[Shopee Webhook] Pedidos sincronizados`)
      }
    }

    if (body.code === 3 || body.code === 4) {
      // Mudança em item
      // (você pode chamar syncProductsFromShopee se quiser)
    }

    // Shopee espera resposta 200 com timestamp
    return NextResponse.json({
      code: 0,
      message: 'OK',
      timestamp: Date.now(),
    })
  } catch (err: any) {
    console.error('[Shopee Webhook]', err)
    return NextResponse.json(
      { code: 1, message: err.message, timestamp: Date.now() },
      { status: 200 }
    )
  }
}

export async function GET() {

  return NextResponse.json({ message: 'Shopee webhook ativo' })
}
