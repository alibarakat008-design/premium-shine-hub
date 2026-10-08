/**
 * =====================================================
 * API: Dashboard do Afiliado
 * =====================================================
 * GET /api/afiliados/dashboard
 * (afiliado logado vê seus próprios dados)
 * =====================================================
 */

// app/api/afiliados/dashboard/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {

  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'afiliado') {
    return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 })
  }

  const afiliadoId = session.user.id

  // Buscar dados do afiliado
  const user = await prisma.users.findUnique({
    where: { id: afiliadoId },
    include: { _count: { select: {} } },
  })

  if (!user || user.role !== 'afiliado') {
    return NextResponse.json({ success: false, error: 'Afiliado não encontrado' }, { status: 404 })
  }

  const data: any = user.afiliado_data || {}

  // Vendas do mês
  const inicioMes = new Date()
  inicioMes.setDate(1)
  inicioMes.setHours(0, 0, 0, 0)

  const vendasMes = await prisma.orders.aggregate({
    where: {
      afiliado_id: afiliadoId,
      created_at: { gte: inicioMes },
      status: { notIn: ['cancelado'] },
    },
    _sum: { total: true, comissao_afiliado_valor: true },
    _count: true,
  })

  return NextResponse.json({
    success: true,
    data: {
      id: user.id,
      nome: user.nome,
      slug: data.slug,
      comissao_pct: data.comissao_pct || 10,
      pix_key: data.pix_key,
      saldo: Number(data.saldo || 0),
      total_vendas: vendasMes._count,
      total_comissao: Number(vendasMes._sum.comissao_afiliado_valor || 0),
      vendas_mes: {
        quantidade: vendasMes._count,
        valor: Number(vendasMes._sum.total || 0),
        comissao: Number(vendasMes._sum.comissao_afiliado_valor || 0),
      },
    },
  })
}
