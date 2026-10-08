import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * Stats do backfill ML — quantas orders têm comissão/frete/recebimento preenchidos
 */
export async function GET() {
  const total = await prisma.orders.count({ where: { origem: 'mercado_livre' } })
  const comComissao = await prisma.orders.count({
    where: { origem: 'mercado_livre', comissao_seller_valor: { not: null } },
  })
  const comFrete = await prisma.orders.count({
    where: { origem: 'mercado_livre', frete: { not: null } },
  })
  const comRecebimento = await prisma.orders.count({
    where: { origem: 'mercado_livre', recebimento_liquido: { not: null } },
  })

  // Soma totais (apenas orders com os campos preenchidos)
  const totais = await prisma.orders.aggregate({
    where: { origem: 'mercado_livre', recebimento_liquido: { not: null } },
    _sum: { total: true, comissao_seller_valor: true, frete: true, recebimento_liquido: true },
  })

  // Amostra de 5 orders pra mostrar
  const amostra = await prisma.orders.findMany({
    where: { origem: 'mercado_livre', recebimento_liquido: { not: null } },
    select: {
      order_number: true,
      total: true,
      comissao_seller_valor: true,
      frete: true,
      recebimento_liquido: true,
      comissao_seller_pct: true,
    },
    orderBy: { total: 'desc' },
    take: 5,
  })

  return NextResponse.json({
    success: true,
    stats: {
      total_orders_ml: total,
      com_comissao_salva: comComissao,
      com_frete_salvo: comFrete,
      com_recebimento_salvo: comRecebimento,
      pct_com_recebimento: total > 0 ? Math.round((comRecebimento / total) * 100) : 0,
    },
    totais_gerais: {
      receita_bruta: Number((totais._sum.total || 0).toFixed(2)),
      comissao_total: Number((totais._sum.comissao_seller_valor || 0).toFixed(2)),
      frete_total: Number((totais._sum.frete || 0).toFixed(2)),
      recebimento_total: Number((totais._sum.recebimento_liquido || 0).toFixed(2)),
      taxa_comissao_media: totais._sum.total && totais._sum.comissao_seller_valor
        ? Number(((Number(totais._sum.comissao_seller_valor) / Number(totais._sum.total)) * 100).toFixed(2))
        : 0,
    },
    amostra_top5_por_total: amostra.map((o) => ({
      order: o.order_number,
      venda: Number(o.total),
      comissao: Number(o.comissao_seller_valor || 0),
      frete: Number(o.frete || 0),
      recebimento: Number(o.recebimento_liquido || 0),
      // valida: venda - comissao - frete = recebimento?
      check_bate: Math.abs(Number(o.total) - Number(o.comissao_seller_valor || 0) - Number(o.frete || 0) - Number(o.recebimento_liquido || 0)) < 0.05,
    })),
  })
}
