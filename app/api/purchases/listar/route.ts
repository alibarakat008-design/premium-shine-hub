/**
 * API: Listar Pedidos de Compra
 * GET /api/purchases/listar
 */

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const purchases = await prisma.supplier_purchases.findMany({
      orderBy: { data_pedido: 'desc' },
      take: 20,
      include: {
        suppliers: { select: { nome: true } },
        _count: { select: { supplier_purchase_items: true } },
      },
    })
    return NextResponse.json({ success: true, data: purchases })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
