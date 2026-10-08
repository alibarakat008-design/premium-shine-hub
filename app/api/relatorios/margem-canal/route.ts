/**
 * API: Margem por Canal de Venda
 * GET /api/relatorios/margem-canal?meses=6
 *
 * Compara ML, Shopee, Site B2C, B2B, Vendedora
 * - Receita, CMV, Comissões, Lucro
 * - Margem % por canal
 * - Ranking
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// Comissões típicas por canal
const COMISSOES: Record<string, number> = {
  mercado_livre: 13, // 13% ML Gold
  shopee: 14,
  site_b2c: 4,
  whatsapp: 0,
  b2b: 5,
  vendedora: 10,
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const meses = parseInt(searchParams.get('meses') || '6')

    const dataInicio = new Date()
    dataInicio.setMonth(dataInicio.getMonth() - meses)

    const orders = await prisma.orders.findMany({
      where: { created_at: { gte: dataInicio } },
      select: {
        id: true,
        total: true,
        created_at: true,
        marketplace_account_id: true,
        marketplace_accounts: { select: { plataforma: true } },
        order_items: { select: { quantidade: true, preco_unitario: true, products: { select: { product_prices: { where: { canal: 'mercado_livre' }, select: { custo: true } } } } } },
      },
    })

    interface CanalStats {
      canal: string
      pedidos: number
      receita: number
      cmv: number
      comissao: number
      lucro: number
      margem_pct: number
    }

    const canaisMap = new Map<string, CanalStats>()

    for (const o of orders) {
      const canal = o.marketplace_accounts?.plataforma || 'outros'
      if (!canaisMap.has(canal)) {
        canaisMap.set(canal, { canal, pedidos: 0, receita: 0, cmv: 0, comissao: 0, lucro: 0, margem_pct: 0 })
      }
      const c = canaisMap.get(canal)!
      const total = Number(o.total)
      c.pedidos++
      c.receita += total

      // CMV
      for (const it of o.order_items) {
        const custo = it.products.product_prices[0]?.custo ? Number(it.products.product_prices[0].custo.toString()) : 0
        c.cmv += custo * it.quantidade
      }

      // Comissão
      const comissaoPct = COMISSOES[canal] || 5
      c.comissao += total * (comissaoPct / 100)

      // Lucro
      c.lucro = c.receita - c.cmv - c.comissao
      c.margem_pct = c.receita > 0 ? (c.lucro / c.receita) * 100 : 0
    }

    const canais = Array.from(canaisMap.values()).sort((a, b) => b.receita - a.receita)

    // Resumo
    const totalReceita = canais.reduce((acc, c) => acc + c.receita, 0)
    const totalLucro = canais.reduce((acc, c) => acc + c.lucro, 0)
    const resumo = {
      total_canais: canais.length,
      receita_total: totalReceita,
      lucro_total: totalLucro,
      margem_media: totalReceita > 0 ? (totalLucro / totalReceita) * 100 : 0,
      melhor_canal: canais[0]?.canal,
      pior_canal: canais[canais.length - 1]?.canal,
    }

    // Vendas mensais por canal
    const vendasMensais: Record<string, Record<string, number>> = {}
    for (const o of orders) {
      const canal = o.marketplace_accounts?.plataforma || 'outros'
      if (!o.created_at) continue
      const d = new Date(o.created_at)
      const mes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      if (!vendasMensais[mes]) vendasMensais[mes] = {}
      if (!vendasMensais[mes][canal]) vendasMensais[mes][canal] = 0
      vendasMensais[mes][canal] += Number(o.total)
    }

    return NextResponse.json({
      success: true,
      data: { canais, resumo, vendas_mensais: vendasMensais, comissoes: COMISSOES },
    })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
