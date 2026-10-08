/**
 * =====================================================
 * API: Emitir NF-e pra um pedido
 * =====================================================
 * POST /api/nfe/emitir
 * Body: { order_id, force? }
 * =====================================================
 */

// app/api/nfe/emitir/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { createNFe, buildNFeFromOrder, getNFeStatus } from '@/lib/focus-nfe/client'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {

  try {
    const { order_id, force } = await request.json()

    // 1) Buscar pedido
    const order = await prisma.orders.findUnique({
      where: { id: order_id },
      include: {
        customers: true,
        companies: true,
        order_items: { include: { products: true } },
      },
    })

    if (!order) {
      return NextResponse.json({ success: false, error: 'Pedido não encontrado' }, { status: 404 })
    }

    if (!order.companies) {
      return NextResponse.json({ success: false, error: 'Pedido sem empresa vinculada' }, { status: 400 })
    }

    if (!order.customers) {
      return NextResponse.json({ success: false, error: 'Pedido sem cliente' }, { status: 400 })
    }

    // 2) Verificar se já tem NF-e (desabilitado)
    // Invoice_id não existe no schema orders
    // if (order.invoice_id && !force) {
    //   // skip duplicate check
    // }

    // 3) Verificar status do pagamento
    if (order.status === 'pendente') {
      return NextResponse.json({
        success: false,
        error: 'Pedido ainda não foi pago. NF-e só após confirmação.',
      }, { status: 400 })
    }

    // 4) Montar NF-e
    const nfeData = buildNFeFromOrder(order, order.companies, order.customers, order.order_items)

    // 5) Emitir via Focus NFe
    const ref = order.id // nossa referência
    const result = await createNFe(ref, nfeData)

    console.log(`[NF-e] Resultado: ${result.status} - ${result.mensagem}`)

    // 6) Salvar no banco
    if (result.status === 'autorizado' || result.status === 'pendente') {
      const invoice = await prisma.invoices.create({
        data: {
          company_id: order.companies.id,
          order_id: order.id,
          numero: result.numero || 'pendente',
          chave_acesso: result.chave || ref,
          tipo: 'NFe',
          status: result.status,
          valor_total: Number(order.total),
          xml_url: result.xml_url,
          pdf_url: result.pdf_url,
          emitida_em: new Date(),
        },
      })

      // Vincular ao pedido
      await prisma.orders.update({
        where: { id: order.id },
        data: { invoices: { connect: { id: invoice.id } } },
      })

      // Alerta pro admin
      if (result.status === 'autorizado') {
        await prisma.system_alerts.create({
          data: {
            tipo: 'nfe_emitida',
            severidade: 'info',
            titulo: `NF-e emitida: Pedido #${order.order_number}`,
            mensagem: `NF-e #${result.numero} autorizada. Chave: ${result.chave}`,
          },
        })
      }

      return NextResponse.json({
        success: true,
        data: {
          status: result.status,
          numero: result.numero,
          chave: result.chave,
          pdf_url: result.pdf_url,
          xml_url: result.xml_url,
        },
        message: result.status === 'autorizado' ? 'NF-e emitida com sucesso!' : 'NF-e em processamento, aguarde alguns segundos',
      })
    }

    if (result.status === 'rejeitado') {
      return NextResponse.json({
        success: false,
        error: 'NF-e rejeitada pela SEFAZ',
        details: result.erros,
      }, { status: 400 })
    }

    return NextResponse.json({
      success: false,
      error: result.mensagem || 'Erro desconhecido',
    }, { status: 500 })
  } catch (err: any) {
    console.error('[API NFe Emitir]', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
