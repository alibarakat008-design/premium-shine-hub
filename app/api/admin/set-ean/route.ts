// /api/admin/set-ean
// POST: atualiza EAN de um produto
// Body: { product_id: string, ean: string }
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isMatrizRequest } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  if (!isMatrizRequest(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const { product_id, ean } = await req.json()
    if (!product_id) {
      return NextResponse.json({ ok: false, error: 'product_id required' }, { status: 400 })
    }
    const result = await prisma.products.update({
      where: { id: product_id },
      data: { ean: ean || null },
      select: { id: true, sku: true, nome: true, ean: true },
    })
    return NextResponse.json({ ok: true, product: result })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
