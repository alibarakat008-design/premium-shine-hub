/**
 * =====================================================
 * WEBHOOK ASAAS — Confirmação de pagamento
 * =====================================================
 * Asaas chama este endpoint quando:
 *   - Pagamento foi recebido (PAGO)
 *   - Pagamento foi cancelado
 *   - Pagamento foi estornado
 *
 * Atualiza o status do pedido automaticamente
 * =====================================================
 */

// app/api/payment/webhook/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { validateAsaasWebhook, checkPaymentStatus } from '@/lib/asaas/client'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {

  try {
    const body = await request.json()
    const signature = request.headers.get('asaas-access-token') || ''

    // Validar webhook (segurança)
    if (!validateAsaasWebhook(body, signature)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('[Asaas Webhook] Evento:', body.event)

    // Eventos possíveis:
    // - PAYMENT_RECEIVED
    // - PAYMENT_CONFIRMED
    // - PAYMENT_OVERDUE
    // - PAYMENT_REFUNDED
    // - PAYMENT_CANCELLED

    if (body.event === 'PAYMENT_RECEIVED' || body.event === 'PAYMENT_CONFIRMED') {
      // Buscar detalhes do pagamento
      const payment = await checkPaymentStatus(body.payment?.id)

      if (!payment.paid) return NextResponse.json({ received: true })

      // Encontrar pedido pelo externalReference
      const order = await prisma.orders.findFirst({
        where: { payment_id: body.payment.id },
        include: { order_items: true },
      })

      if (!order) {
        console.warn('[Asaas] Pedido não encontrado para payment_id:', body.payment.id)
        return NextResponse.json({ received: true })
      }

      // Atualizar status e pagar
      await prisma.orders.update({
        where: { id: order.id },
        data: {
          status: 'confirmado',
          pago_em: new Date(),
        },
      })

      // Baixar estoque de cada item
      for (const item of order.order_items) {
        if (item.product_id) {
          const inv = await prisma.inventory.findFirst({
            where: { product_id: item.product_id },
          })
          if (inv) {
            const novaQtd = Math.max(0, inv.quantidade_atual - item.quantidade)
            await prisma.inventory.update({
              where: { id: inv.id },
              data: {
                quantidade_atual: novaQtd,
                ultima_saida: new Date(),
              },
            })

            // Registrar movimentação
            await prisma.inventory_movements.create({
              data: {
                product_id: item.product_id,
                tipo: 'saida',
                quantidade: -item.quantidade,
                estoque_anterior: inv.quantidade_atual,
                estoque_posterior: novaQtd,
                origem_tipo: 'venda_pix',
                origem_id: order.id,
                observacao: `Venda PIX #${order.order_number}`,
              },
            })
          }
        }
      }

      console.log(`[Asaas] Pedido ${order.order_number} confirmado via PIX`)
    }

    if (body.event === 'PAYMENT_OVERDUE') {
      // Marcar pedido como pendente (cliente não pagou)
      const order = await prisma.orders.findFirst({
        where: { payment_id: body.payment.id },
      })
      if (order) {
        // Não cancelar automaticamente — cliente pode pagar depois
        console.log(`[Asaas] Pedido ${order.order_number} PIX vencido`)
      }
    }

    return NextResponse.json({ received: true })
  } catch (err: any) {
    console.error('[Asaas Webhook]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
