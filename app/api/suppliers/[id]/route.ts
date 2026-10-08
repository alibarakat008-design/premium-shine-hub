/**
 * API: Fornecedor individual
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await request.json()
    const supplier = await prisma.suppliers.update({
      where: { id: params.id },
      data: { ...body, updated_at: new Date() },
    })
    return NextResponse.json({ success: true, data: supplier })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const count = await prisma.products.count({ where: { fornecedor_id: params.id } })
    if (count > 0) {
      return NextResponse.json({ success: false, error: `Fornecedor tem ${count} produtos.` }, { status: 400 })
    }
    await prisma.suppliers.delete({ where: { id: params.id } })
    return NextResponse.json({ success: true, message: 'Removido' })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
