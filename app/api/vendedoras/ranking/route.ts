/**
 * =====================================================
 * API: Ranking de Vendedoras
 * =====================================================
 * GET /api/vendedoras/ranking?mes=2026-06
 *
 * Top 10 do mês com badge, score, bônus
 * =====================================================
 */

// app/api/vendedoras/ranking/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {

  const { searchParams } = new URL(request.url)
  const mesRef = searchParams.get('mes') // YYYY-MM
  const limite = Number(searchParams.get('limite') || 10)

  // Calcular período
  let dataInicio: Date
  let dataFim: Date

  if (mesRef) {
    const [ano, mes] = mesRef.split('-').map(Number)
    dataInicio = new Date(ano, mes - 1, 1)
    dataFim = new Date(ano, mes, 0, 23, 59, 59)
  } else {
    // Mês atual
    const hoje = new Date()
    dataInicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
    dataFim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0, 23, 59, 59)
  }

  // Buscar todas as vendedoras ativas
  const vendedoras = await prisma.users.findMany({
    where: { role: 'vendedora', ativo: true },
    select: { id: true, nome: true, avatar_url: true, vendedora_data: true },
  })

  // Para cada vendedora, calcular performance
  const ranking = await Promise.all(
    vendedoras.map(async (v) => {
      const vendas = await prisma.orders.aggregate({
        where: {
          vendedor_id: v.id,
          created_at: { gte: dataInicio, lte: dataFim },
          status: { notIn: ['cancelado'] },
        },
        _sum: { total: true, comissao_vendedora_valor: true },
        _count: true,
      })

      const data: any = v.vendedora_data || {}
      const valor = Number(vendas._sum.total || 0)
      const meta = data.meta_valor || 5000
      const percentual = (valor / meta) * 100

      // Calcular bônus
      let bonus = 0
      if (percentual >= 150) {
        bonus = valor * (data.bonus_super_meta_pct || 10) / 100
      } else if (percentual >= 100) {
        bonus = valor * (data.bonus_meta_pct || 5) / 100
      }

      return {
        vendedora_id: v.id,
        nome: v.nome,
        foto: v.avatar_url,
        vendas_quantidade: vendas._count,
        vendas_valor: valor,
        comissao: Number(vendas._sum.comissao_vendedora_valor || 0),
        meta: meta,
        percentual_atingido: Math.round(percentual * 100) / 100,
        bonus: bonus,
        // Score combinado: vendas + meta atingida
        score: valor + (bonus * 10), // bônus pesa mais
      }
    })
  )

  // Ordenar por score
  const top = ranking
    .filter((r) => r.vendas_quantidade > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limite)
    .map((r, idx) => ({
      ...r,
      posicao: idx + 1,
      badge: idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}º`,
      premio: idx === 0 ? '🏆 Top Vendedor do Mês' : null,
    }))

  return NextResponse.json({
    success: true,
    periodo: { inicio: dataInicio, fim: dataFim },
    data: top,
  })
}
