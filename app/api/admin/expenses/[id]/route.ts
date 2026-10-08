/**
 * GET    /api/admin/expenses/[id]
 * PUT    /api/admin/expenses/[id] — atualizar gasto
 * DELETE /api/admin/expenses/[id] — remover gasto
 * POST   /api/admin/expenses/[id]/pay — marcar como pago
 */
import { NextRequest, NextResponse } from 'next/server'
import { isMatrizRequest } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isMatrizRequest(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  try {
    const expense = await prisma.expenses.findUnique({ where: { id: params.id } })
    if (!expense) return NextResponse.json({ ok: false, error: 'Não encontrado' }, { status: 404 })
    return NextResponse.json({ ok: true, expense })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isMatrizRequest(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  try {
    const body = await req.json()
    const { description, amount, category_type, category, due_date, recurrence, notes, status } = body

    const data: any = {}
    if (description !== undefined) data.description = description.trim()
    if (amount !== undefined) data.amount = parseFloat(amount)
    if (category_type !== undefined) data.category_type = category_type
    if (category !== undefined) data.category = category
    if (due_date !== undefined) data.due_date = new Date(due_date)
    if (recurrence !== undefined) data.recurrence = recurrence
    if (notes !== undefined) data.notes = notes
    if (status !== undefined) data.status = status
    data.updated_at = new Date()

    const updated = await prisma.expenses.update({ where: { id: params.id }, data })
    return NextResponse.json({ ok: true, expense: updated })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isMatrizRequest(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  try {
    await prisma.expenses.delete({ where: { id: params.id } })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
