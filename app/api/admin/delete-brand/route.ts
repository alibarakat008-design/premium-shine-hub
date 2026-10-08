// /api/admin/delete-brand
// DELETE: exclui uma marca (sem products) pelo nome
// Query: ?nome=X
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isMatrizRequest } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

export async function DELETE(req: NextRequest) {
  if (!isMatrizRequest(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const { searchParams } = new URL(req.url)
    const nome = searchParams.get('nome')
    if (!nome) {
      return NextResponse.json({ ok: false, error: 'nome required' }, { status: 400 })
    }

    const result = await prisma.brands.deleteMany({
      where: { nome: { equals: nome.trim().toUpperCase(), mode: 'insensitive' } },
    })
    return NextResponse.json({ ok: true, deleted: result.count })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
