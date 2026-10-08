/**
 * =====================================================
 * API: /api/financeiro/comissoes
 * Comissões de vendedoras e afiliados
 * =====================================================
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {

  try {
    const { searchParams } = new URL(request.url)
    const tipo = searchParams.get('tipo') // 'vendedora' | 'afiliado' | 'seller'

    // Comissões pagas
    const comissoesPagas = await prisma.commissions_paid.findMany({
      orderBy: { created_at: 'desc' },
      take: 50,
    })

    // Vendedoras e suas comissões (baseado nos orders)
    const vendedoras = await prisma.users.findMany({
      where: { role: 'vendedora' },
    })

    const comissoesVendedoras = await Promise.all(
      vendedoras.map(async (v) => {
        const vendas = await prisma.orders.aggregate({
          where: { vendedor_id: v.id },
          _sum: { comissao_vendedora_valor: true, total: true },
          _count: { id: true },
        })
        return {
          user_id: v.id,
          nome: v.nome,
          email: v.email,
          role: 'vendedora',
          total_vendas: vendas._count.id,
          valor_vendido: Number(vendas._sum.total || 0),
          comissao_gerada: Number(vendas._sum.comissao_vendedora_valor || 0),
        }
      })
    )

    // Afiliados
    const afiliados = await prisma.users.findMany({
      where: { role: 'afiliado' },
    })

    const comissoesAfiliados = await Promise.all(
      afiliados.map(async (a) => {
        const vendas = await prisma.orders.aggregate({
          where: { afiliado_id: a.id },
          _sum: { comissao_afiliado_valor: true, total: true },
          _count: { id: true },
        })
        return {
          user_id: a.id,
          nome: a.nome,
          email: a.email,
          role: 'afiliado',
          total_vendas: vendas._count.id,
          valor_vendido: Number(vendas._sum.total || 0),
          comissao_gerada: Number(vendas._sum.comissao_afiliado_valor || 0),
        }
      })
    )

    // Metas do mês
    const mesAtual = new Date().toISOString().slice(0, 7) // YYYY-MM
    const metas = await prisma.seller_goals.findMany({
      where: { mes_ano: mesAtual },
    })

    // Totais
    const totaisVendedoras = comissoesVendedoras.reduce(
      (acc, c) => ({
        comissao: acc.comissao + c.comissao_gerada,
        vendas: acc.vendas + c.valor_vendido,
      }),
      { comissao: 0, vendas: 0 }
    )
    const totaisAfiliados = comissoesAfiliados.reduce(
      (acc, c) => ({
        comissao: acc.comissao + c.comissao_gerada,
        vendas: acc.vendas + c.valor_vendido,
      }),
      { comissao: 0, vendas: 0 }
    )

    return NextResponse.json({
      success: true,
      data: {
        comissoes_pagas: comissoesPagas,
        ranking_vendedoras: comissoesVendedoras.sort(
          (a, b) => b.comissao_gerada - a.comissao_gerada
        ),
        ranking_afiliados: comissoesAfiliados.sort(
          (a, b) => b.comissao_gerada - a.comissao_gerada
        ),
        metas_mes_atual: metas,
        totais: {
          vendedoras: totaisVendedoras,
          afiliados: totaisAfiliados,
          total_geral: totaisVendedoras.comissao + totaisAfiliados.comissao,
        },
      },
    })
  } catch (err: any) {
    console.error('[API Comissões]', err)
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    )
  }
}
