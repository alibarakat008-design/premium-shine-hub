/**
 * API: CRM de Clientes
 * GET /api/customers/[id] - detalhe completo
 * PUT /api/customers/[id]/tags - atualiza tags
 * POST /api/customers/[id]/notes - adiciona nota
 * DELETE /api/customers/[id]/notes/[noteId] - remove nota
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const customer = await prisma.customers.findUnique({
      where: { id: params.id },
      include: {
        orders: {
          orderBy: { created_at: 'desc' },
          take: 50,
          select: {
            id: true,
            total: true,
            status: true,
            created_at: true,
            marketplace_accounts: { select: { plataforma: true } },
            order_items: { select: { quantidade: true, products: { select: { nome: true, sku: true } } } },
          },
        },
        customer_notes: { orderBy: { created_at: 'desc' } },
        customer_tags: { orderBy: { created_at: 'desc' } },
      },
    })
    if (!customer) return NextResponse.json({ success: false, error: 'Cliente não encontrado' }, { status: 404 })
    return NextResponse.json({ success: true, data: customer })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
