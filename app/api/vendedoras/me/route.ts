/**
 * =====================================================
 * API: Vendedora vê seus próprios dados
 * =====================================================
 * GET /api/vendedoras/me
 * (vendedora logada)
 * =====================================================
 */

// app/api/vendedoras/me/route.ts

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {

  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'vendedora') {
    return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 })
  }

  const vendedoraId = session.user.id

  const user = await prisma.users.findUnique({ where: { id: vendedoraId } })
  if (!user) return NextResponse.json({ success: false, error: 'Não encontrado' }, { status: 404 })

  const data: any = user.vendedora_data || {}

  // Vendas do mês
  const inicioMes = new Date()
  inicioMes.setDate(1)
  inicioMes.setHours(0, 0, 0, 0)

  const vendas = await prisma.orders.aggregate({
    where: {
      vendedor_id: vendedoraId,
      created_at: { gte: inicioMes },
      status: { notIn: ['cancelado'] },
    },
    _sum: { total: true, comissao_vendedora_valor: true },
    _count: true,
  })

  const valor = Number(vendas._sum.total || 0)
  const meta = data.meta_valor || 5000
  const percentual = (valor / meta) * 100

  return NextResponse.json({
    success: true,
    data: {
      id: user.id,
      nome: user.nome,
      vendas_mes: {
        quantidade: vendas._count,
        valor,
        comissao: Number(vendas._sum.comissao_vendedora_valor || 0),
      },
      meta: {
        valor: meta,
        percentual_atingido: Math.round(percentual * 100) / 100,
      },
      comissao_config: {
        pct: data.comissao_pct || 10,
      },
    },
  })
}
