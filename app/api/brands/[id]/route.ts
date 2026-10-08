/**
 * API: Marca individual
 * PUT /api/brands/[id]
 * DELETE /api/brands/[id]
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await request.json()
    const brand = await prisma.brands.update({
      where: { id: params.id },
      data: {
        nome: body.nome,
        descricao: body.descricao,
        logo_url: body.logo_url,
      },
    })
    return NextResponse.json({ success: true, data: brand })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    // Verificar se tem produtos
    const count = await prisma.products.count({ where: { marca_id: params.id } })
    if (count > 0) {
      return NextResponse.json({ success: false, error: `Marca tem ${count} produtos. Remova os produtos primeiro.` }, { status: 400 })
    }
    await prisma.brands.delete({ where: { id: params.id } })
    return NextResponse.json({ success: true, message: 'Marca removida' })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
