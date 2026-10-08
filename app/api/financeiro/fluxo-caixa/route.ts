/**
 * =====================================================
 * API: /api/financeiro/fluxo-caixa
 * Lista entradas e saídas do fluxo de caixa
 * =====================================================
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
    const tipo = searchParams.get('tipo') // 'entrada' | 'saida'
    const categoria = searchParams.get('categoria')
    const realizado = searchParams.get('realizado') // 'true' | 'false'

    const where: any = {}
    if (tipo) where.tipo = tipo
    if (categoria) where.categoria = categoria
    if (realizado !== null && realizado !== undefined) {
      where.realizado = realizado === 'true'
    }

    const [items, total, totalizadores] = await Promise.all([
      prisma.cashflow.findMany({
        where,
        orderBy: { data_prevista: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.cashflow.count({ where }),
      // Totalizadores
      Promise.all([
        prisma.cashflow.aggregate({
          where: { ...where, tipo: 'entrada', realizado: true },
          _sum: { valor: true },
        }),
        prisma.cashflow.aggregate({
          where: { ...where, tipo: 'saida', realizado: true },
          _sum: { valor: true },
        }),
        prisma.cashflow.aggregate({
          where: { ...where, tipo: 'entrada', realizado: false },
          _sum: { valor: true },
        }),
        prisma.cashflow.aggregate({
          where: { ...where, tipo: 'saida', realizado: false },
          _sum: { valor: true },
        }),
      ]),
    ])

    const [entradasRealizadas, saidasRealizadas, entradasPrevistas, saidasPrevistas] = totalizadores

    return NextResponse.json({
      success: true,
      data: items,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
      totais: {
        entradas_realizadas: Number(entradasRealizadas._sum.valor || 0),
        saidas_realizadas: Number(saidasRealizadas._sum.valor || 0),
        saldo_realizado:
          Number(entradasRealizadas._sum.valor || 0) - Number(saidasRealizadas._sum.valor || 0),
        entradas_previstas: Number(entradasPrevistas._sum.valor || 0),
        saidas_previstas: Number(saidasPrevistas._sum.valor || 0),
        saldo_previsto:
          Number(entradasPrevistas._sum.valor || 0) - Number(saidasPrevistas._sum.valor || 0),
      },
    })
  } catch (err: any) {
    console.error('[API Fluxo Caixa]', err)
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    )
  }
}

// POST - Criar novo lançamento
export async function POST(request: NextRequest) {

  try {
    const body = await request.json()
    const item = await prisma.cashflow.create({
      data: {
        company_id: body.company_id,
        tipo: body.tipo, // 'entrada' ou 'saida'
        categoria: body.categories,
        descricao: body.descricao,
        valor: body.valor,
        order_id: body.order_id,
        purchase_id: body.purchase_id,
        data_prevista: new Date(body.data_prevista),
        data_realizada: body.realizado ? new Date() : null,
        realizado: body.realizado || false,
        conta_bancaria: body.conta_bancaria,
      },
    })
    return NextResponse.json({ success: true, data: item })
  } catch (err: any) {
    console.error('[API Fluxo Caixa POST]', err)
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    )
  }
}
