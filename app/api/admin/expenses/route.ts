/**
 * GET  /api/admin/expenses — lista gastos
 * POST /api/admin/expenses — criar gasto
 */
import { NextRequest, NextResponse } from 'next/server'
import { isMatrizRequest } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!isMatrizRequest(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  try {
    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')
    const catType = searchParams.get('category_type')
    const mes = searchParams.get('mes')
    const ano = searchParams.get('ano')

    const where: any = {}
    if (status) where.status = status
    if (catType) where.category_type = catType
    if (mes && ano) {
      const start = new Date(parseInt(ano), parseInt(mes) - 1, 1)
      const end = new Date(parseInt(ano), parseInt(mes), 0)
      where.due_date = { gte: start, lte: end }
    }

    const expenses = await prisma.expenses.findMany({
      where,
      orderBy: { due_date: 'asc' },
    })

    // Totais
    const totalPendente = expenses.filter(e => e.status === 'pending').reduce((a, e) => a + Number(e.amount), 0)
    const totalPago = expenses.filter(e => e.status === 'paid').reduce((a, e) => a + Number(e.amount), 0)
    const totalFixo = expenses.filter(e => e.category_type === 'fixed').reduce((a, e) => a + Number(e.amount), 0)
    const totalVariavel = expenses.filter(e => e.category_type === 'variable').reduce((a, e) => a + Number(e.amount), 0)

    return NextResponse.json({
      ok: true,
      expenses,
      totais: {
        total_pendente: totalPendente,
        total_pago: totalPago,
        total_geral: totalPendente + totalPago,
        total_fixo: totalFixo,
        total_variavel: totalVariavel,
        count_pendente: expenses.filter(e => e.status === 'pending').length,
        count_pago: expenses.filter(e => e.status === 'paid').length,
      },
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  if (!isMatrizRequest(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    const { description, amount, category_type, category, due_date, recurrence, notes, company_id } = body

    if (!description?.trim()) return NextResponse.json({ ok: false, error: 'Descrição obrigatória' }, { status: 400 })
    if (!amount || parseFloat(amount) <= 0) return NextResponse.json({ ok: false, error: 'Valor deve ser maior que zero' }, { status: 400 })
    if (!category_type || !['fixed', 'variable'].includes(category_type)) return NextResponse.json({ ok: false, error: 'Tipo inválido (fixed/variable)' }, { status: 400 })
    if (!due_date) return NextResponse.json({ ok: false, error: 'Data de vencimento obrigatória' }, { status: 400 })

    const expense = await prisma.expenses.create({
      data: {
        description: description.trim(),
        amount: parseFloat(amount),
        category_type,
        category: category || 'outros',
        due_date: new Date(due_date),
        recurrence: recurrence || 'monthly',
        notes: notes || null,
        company_id: company_id || null,
        status: 'pending',
      },
    })

    return NextResponse.json({ ok: true, expense })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
