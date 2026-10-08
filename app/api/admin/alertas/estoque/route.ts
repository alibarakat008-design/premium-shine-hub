/**
 * Alerta de Estoque Baixo
 *
 * Cruza estoque atual × vendas dos últimos 7 dias × projeção de dias até zerar
 *
 * Retorna:
 * - críticos: stock <= 5 OU projeção <= 3 dias
 * - atenção: stock <= 20 OU projeção <= 7 dias
 * - normal: demais
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const dias = parseInt(searchParams.get('dias') || '7', 10)

    // 1) Buscar todos os produtos ativos com estoque (sum das listings ML)
    const produtos = await prisma.$queryRawUnsafe(`
      SELECT
        p.id,
        p.sku,
        p.nome,
        p.foto_principal_url,
        COALESCE(SUM(ml.stock_disponivel_ml), 0)::int as estoque_total,
        b.nome as marca
      FROM products p
      LEFT JOIN marketplace_listings ml ON ml.product_id = p.id
      LEFT JOIN brands b ON b.id = p.marca_id
      WHERE p.ativo = true
      GROUP BY p.id, p.sku, p.nome, p.foto_principal_url, b.nome
    `) as any[]

    // 2) Calcular vendas dos últimos N dias
    const dataInicio = new Date(Date.now() - dias * 24 * 3600 * 1000)
    const vendas = await prisma.order_items.groupBy({
      by: ['product_id'],
      where: {
        product_id: { not: null },
        orders: {
          created_at: { gte: dataInicio },
          status: { notIn: ['cancelado', 'devolvido'] },
        },
      },
      _sum: { quantidade: true },
    })

    const vendasMap = new Map<string, number>()
    for (const v of vendas) {
      if (v.product_id) vendasMap.set(v.product_id, v._sum.quantidade || 0)
    }

    // 3) Calcular alerta por produto
    const alertas: any[] = []
    for (const p of produtos) {
      const stock = Number(p.estoque_total || 0)
      const vendidoPeriodo = vendasMap.get(p.id) || 0
      const vendaDiaria = vendidoPeriodo / dias
      const diasAteZerar = vendaDiaria > 0 ? Math.floor(stock / vendaDiaria) : 999

      // Crítico: só alerta se tiver venda no período (senão não vende, não precisa repor)
      if (vendidoPeriodo > 0 && (stock <= 5 || diasAteZerar <= 3)) {
        alertas.push({
          ...p,
          nivel: 'critico',
          stock,
          vendido_periodo: vendidoPeriodo,
          venda_diaria: Number(vendaDiaria.toFixed(2)),
          dias_ate_zerar: Math.min(diasAteZerar, 999),
          sugestao: 'COMPRAR URGENTE',
        })
        continue
      }

      // Atenção: só se tiver venda
      if (vendidoPeriodo > 0 && (stock <= 20 || diasAteZerar <= 7)) {
        alertas.push({
          ...p,
          nivel: 'atencao',
          stock,
          vendido_periodo: vendidoPeriodo,
          venda_diaria: Number(vendaDiaria.toFixed(2)),
          dias_ate_zerar: Math.min(diasAteZerar, 999),
          sugestao: 'Repor em breve',
        })
        continue
      }

      // Normal (só se tiver venda)
      if (vendidoPeriodo > 0) {
        alertas.push({
          ...p,
          nivel: 'ok',
          stock,
          vendido_periodo: vendidoPeriodo,
          venda_diaria: Number(vendaDiaria.toFixed(2)),
          dias_ate_zerar: Math.min(diasAteZerar, 999),
          sugestao: 'OK',
        })
      }
    }

    // Ordena por criticidade
    const ordem: Record<string, number> = { critico: 0, atencao: 1, ok: 2 }
    alertas.sort((a, b) => ordem[a.nivel] - ordem[b.nivel] || a.dias_ate_zerar - b.dias_ate_zerar)

    const criticos = alertas.filter((a) => a.nivel === 'critico').length
    const atencao = alertas.filter((a) => a.nivel === 'atencao').length

    return NextResponse.json({
      ok: true,
      periodo_dias: dias,
      resumo: {
        criticos,
        atencao,
        total_com_venda: alertas.length,
        total_produtos: produtos.length,
      },
      alertas,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
