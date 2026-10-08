// GET /api/b2b/vendas?meses=6&page=1&limit=50
// Lista de vendas do B2B
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/b2b-auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    const session = getSession()
    if (!session) return NextResponse.json({ ok: false, error: 'Não autenticado' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const meses = Math.min(Number(searchParams.get('meses') || 6), 12)
    const page = Math.max(Number(searchParams.get('page') || 1), 1)
    const limit = Math.min(Number(searchParams.get('limit') || 50), 200)
    const status = searchParams.get('status')
    const marketplace = searchParams.get('marketplace')

    const contas = await prisma.b2b_marketplace_accounts.findMany({
      where: { b2b_client_id: session.b2b_client_id },
      select: { id: true, plataforma: true },
    })
    if (contas.length === 0) return NextResponse.json({ ok: true, vendas: [], total: 0 })

    const contaIds = contas.map((c) => c.id)
    const dataInicio = new Date()
    dataInicio.setMonth(dataInicio.getMonth() - meses)

    const where: any = {
      created_at: { gte: dataInicio },
      marketplace_account_id: { in: contaIds },
    }
    if (status && status !== 'todos') where.status = status
    if (marketplace && marketplace !== 'todos') where.origem = marketplace

    const [vendas, total] = await Promise.all([
      prisma.orders.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          order_number: true,
          total: true,
          status: true,
          created_at: true,
          customers: { select: { nome: true, email: true } },
          marketplace_accounts: { select: { nickname: true, plataforma: true } },
          order_items: {
            select: {
              quantidade: true,
              products: { select: { sku: true, nome: true, brands: { select: { nome: true } } } },
            },
          },
        },
      }),
      prisma.orders.count({ where }),
    ])

    return NextResponse.json({
      ok: true,
      total,
      page,
      limit,
      vendas: vendas.map((v) => ({
        id: v.id,
        order_number: v.order_number,
        data: v.created_at,
        total: Number(v.total || 0),
        status: v.status,
        cliente: v.customers?.nome || '—',
        marketplace: v.marketplace_accounts?.nickname || '—',
        plataforma: v.marketplace_accounts?.plataforma || '—',
        itens: v.order_items.length,
        unidades: v.order_items.reduce((s, i) => s + i.quantidade, 0),
      })),
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
