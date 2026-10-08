/**
 * PUT /api/admin/purchase-invoices/[id]
 * Atualiza status da nota de compra
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const authHeader = req.headers.get('authorization') || ''
  if (!authHeader.startsWith('Basic ')) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const body = await req.json()
    const { status } = body
    if (!status) return NextResponse.json({ ok: false, error: 'status obrigatório' }, { status: 400 })

    const valid = ['sugerida', 'aprovada', 'enviada', 'recebida', 'cancelada']
    if (!valid.includes(status)) {
      return NextResponse.json({ ok: false, error: 'status inválido' }, { status: 400 })
    }

    await prisma.$executeRawUnsafe(`
      UPDATE supplier_purchases
      SET status = $1, updated_at = NOW()
      WHERE id = $2::uuid
    `, status, params.id)

    return NextResponse.json({ ok: true, message: 'Status atualizado' })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
