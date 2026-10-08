/**
 * =====================================================
 * API: Movimentações de Estoque
 * =====================================================
 * GET /api/inventory/[productId]/movements
 *
 * Retorna histórico de movimentações
 * =====================================================
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, { params }: { params: { productId: string } }) {
  try {
    const { productId } = params

    const movements = await prisma.inventory_movements.findMany({
      where: { product_id: productId },
      orderBy: { created_at: 'desc' },
      take: 100,
    })

    return NextResponse.json({ success: true, data: movements })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
