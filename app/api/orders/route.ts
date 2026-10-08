/**
 * =====================================================
 * API DE PEDIDOS — Premium Shine Hub
 * =====================================================
 * Endpoints:
 *   GET    /api/orders           — Listar com filtros
 *   GET    /api/orders/:id       — Detalhe de 1 pedido
 *   PATCH  /api/orders/:id       — Atualizar status
 *
 * Stack: Next.js + Prisma
 * =====================================================
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

// =====================================================
// SCHEMAS DE VALIDAÇÃO
// =====================================================
const OrderFiltersSchema = z.object({
  // Filtros
  q: z.string().optional(),
  origem: z.enum(['mercado_livre', 'shopee', 'site_b2c', 'whatsapp', 'b2b', 'vendedora']).optional(),
  status: z.enum(['pendente', 'confirmado', 'separado', 'enviado', 'entregue', 'cancelado', 'devolvido']).optional(),
  company_id: z.string().uuid().optional(),
  vendedor_id: z.string().uuid().optional(),
  afiliado_id: z.string().uuid().optional(),
  marketplace_account_id: z.string().uuid().optional(),

  // Período
  data_inicio: z.string().optional(), // ISO date
  data_fim: z.string().optional(),

  // Faixa de valor
  valor_min: z.number().optional(),
  valor_max: z.number().optional(),

  // Ordenação
  order_by: z.enum(['created_at', 'total', 'status']).default('created_at'),
  order_dir: z.enum(['asc', 'desc']).default('desc'),

  // Paginação
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
})

// =====================================================
// GET /api/orders — Listar pedidos
// =====================================================
export async function GET(request: NextRequest) {

  try {
    const { searchParams } = new URL(request.url)

    const filters = OrderFiltersSchema.parse({
      q: searchParams.get('q') || undefined,
      origem: searchParams.get('origem') || undefined,
      status: searchParams.get('status') || undefined,
      company_id: searchParams.get('company_id') || undefined,
      vendedor_id: searchParams.get('vendedor_id') || undefined,
      afiliado_id: searchParams.get('afiliado_id') || undefined,
      marketplace_account_id: searchParams.get('marketplace_account_id') || undefined,
      data_inicio: searchParams.get('data_inicio') || undefined,
      data_fim: searchParams.get('data_fim') || undefined,
      valor_min: searchParams.get('valor_min') ? Number(searchParams.get('valor_min')) : undefined,
      valor_max: searchParams.get('valor_max') ? Number(searchParams.get('valor_max')) : undefined,
      order_by: searchParams.get('order_by') || 'created_at',
      order_dir: searchParams.get('order_dir') || 'desc',
      page: searchParams.get('page') ? Number(searchParams.get('page')) : 1,
      limit: searchParams.get('limit') ? Number(searchParams.get('limit')) : 20,
    })

    // Construir query
    const where: any = {}

    if (filters.q) {
      where.OR = [
        { order_number: { contains: filters.q, mode: 'insensitive' } },
        { payment_id: { contains: filters.q, mode: 'insensitive' } },
        { codigo_rastreio: { contains: filters.q, mode: 'insensitive' } },
        { customer: { nome: { contains: filters.q, mode: 'insensitive' } } },
        { customer: { email: { contains: filters.q, mode: 'insensitive' } } },
      ]
    }

    if (filters.origem) where.origem = filters.origem
    if (filters.status) where.status = filters.status
    if (filters.company_id) where.company_id = filters.company_id
    if (filters.vendedor_id) where.vendedor_id = filters.vendedor_id
    if (filters.afiliado_id) where.afiliado_id = filters.afiliado_id
    if (filters.marketplace_account_id) where.marketplace_account_id = filters.marketplace_account_id

    if (filters.data_inicio || filters.data_fim) {
      where.created_at = {}
      if (filters.data_inicio) where.created_at.gte = new Date(filters.data_inicio)
      if (filters.data_fim) where.created_at.lte = new Date(filters.data_fim)
    }

    if (filters.valor_min !== undefined || filters.valor_max !== undefined) {
      where.total = {}
      if (filters.valor_min !== undefined) where.total.gte = filters.valor_min
      if (filters.valor_max !== undefined) where.total.lte = filters.valor_max
    }

    // Total para paginação
    const total = await prisma.orders.count({ where })

    // Stats agregados (independente da paginação)
    const stats = await prisma.orders.aggregate({
      where,
      _sum: { total: true, custo_total: true, lucro_liquido: true },
      _count: true,
    })

    // Buscar pedidos
    const ordersRaw = await prisma.orders.findMany({
      where,
      include: {
        customers: { select: { id: true, nome: true, email: true, telefone: true } },
        users_orders_vendedor_idTousers: { select: { id: true, nome: true, role: true } },
        users_orders_afiliado_idTousers: { select: { id: true, nome: true } },
        companies: { select: { id: true, cnpj: true, nome_fantasia: true } },
        marketplace_accounts: { select: { id: true, nickname: true, plataforma: true } },
        order_items: {
          select: {
            id: true,
            nome_produto: true,
            foto_url: true,
            quantidade: true,
            preco_total: true,
          },
        },
      },
      orderBy: { [filters.order_by]: filters.order_dir },
      skip: (filters.page - 1) * filters.limit,
      take: filters.limit,
    })

    // Mapear nomes do banco (estranhos) pra nomes camelCase esperados pela UI
    const orders = ordersRaw.map((o: any) => ({
      ...o,
      customer: o.customers,
      vendedor: o.users_orders_vendedor_idTousers,
      afiliado: o.users_orders_afiliado_idTousers,
      company: o.companies,
      marketplace_account: o.marketplace_accounts,
      items: o.order_items,
      // Remove os nomes estranhos
      customers: undefined,
      users_orders_vendedor_idTousers: undefined,
      users_orders_afiliado_idTousers: undefined,
      companies: undefined,
      marketplace_accounts: undefined,
      order_items: undefined,
    }))

    return NextResponse.json({
      success: true,
      data: orders,
      pagination: {
        page: filters.page,
        limit: filters.limit,
        total,
        total_pages: Math.ceil(total / filters.limit),
      },
      stats: {
        total_pedidos: stats._count,
        faturamento: Number(stats._sum.total || 0),
        custo_total: Number(stats._sum.custo_total || 0),
        lucro_liquido: Number(stats._sum.lucro_liquido || 0),
        ticket_medio: stats._count > 0 ? Number(stats._sum.total || 0) / stats._count : 0,
      },
    })
  } catch (err: any) {
    console.error('[API Orders GET]', err)
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 400 }
    )
  }
}
