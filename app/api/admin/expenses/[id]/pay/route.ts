/**
 * POST /api/admin/expenses/[id]/pay
 * Marca despesa como paga ou pendente
 */
import { NextRequest, NextResponse } from 'next/server'
import { isMatrizRequest } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isMatrizRequest(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    const { paid, paid_date } = body

    const current = await prisma.expenses.findUnique({ where: { id: params.id } })
    if (!current) return NextResponse.json({ ok: false, error: 'Não encontrado' }, { status: 404 })

    const updated = await prisma.expenses.update({
      where: { id: params.id },
      data: {
        status: paid ? 'paid' : 'pending',
        paid_date: paid ? (paid_date ? new Date(paid_date) : new Date()) : null,
        updated_at: new Date(),
      },
    })
    return NextResponse.json({ ok: true, expense: updated })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
