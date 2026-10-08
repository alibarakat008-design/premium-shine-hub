/**
 * =====================================================
 * API: Gerar PIX pra um pedido
 * =====================================================
 * POST /api/payment/pix
 * Body: { order_id }
 *
 * Retorna QR Code + linha digitável
 * =====================================================
 */

// app/api/payment/pix/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { createPixPayment } from '@/lib/asaas/client'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {

  try {
    const { order_id } = await request.json()

    const order = await prisma.orders.findUnique({
      where: { id: order_id },
      include: { customers: true },
    })

    if (!order) {
      return NextResponse.json({ success: false, error: 'Pedido não encontrado' }, { status: 404 })
    }

    if (!order.customers) {
      return NextResponse.json({ success: false, error: 'Pedido sem cliente vinculado' }, { status: 400 })
    }

    if (order.status !== 'pendente') {
      return NextResponse.json({ success: false, error: 'Pedido já foi processado' }, { status: 400 })
    }

    // Criar pagamento no Asaas
    const payment = await createPixPayment({
      orderId: order.id,
      customer: {
        name: order.customers.nome,
        email: order.customers.email,
        phone: order.customers.telefone,
        cpfCnpj: order.customers.cpf || '00000000000', // fallback
        postalCode: (order.endereco_entrega as any)?.cep,
        addressNumber: (order.endereco_entrega as any)?.numero,
        addressCity: (order.endereco_entrega as any)?.cidade,
        addressState: (order.endereco_entrega as any)?.estado,
      },
      value: Number(order.total),
      description: `Pedido #${order.order_number}`,
    })

    // Salvar payment_id no pedido
    await prisma.orders.update({
      where: { id: order.id },
      data: {
        payment_id: payment.paymentId,
        forma_pagamento: 'PIX (Asaas)',
      },
    })

    return NextResponse.json({
      success: true,
      data: {
        payment_id: payment.paymentId,
        pix_qr_code: payment.pixQrCode,
        pix_qr_code_image: payment.pixQrCodeImage,
        invoice_url: payment.invoiceUrl,
        expira_em: payment.expiresAt,
        order_number: order.order_number,
        total: Number(order.total),
      },
    })
  } catch (err: any) {
    console.error('[API Payment PIX]', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
