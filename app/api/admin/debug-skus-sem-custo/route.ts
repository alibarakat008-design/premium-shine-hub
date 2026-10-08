import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * Lista SKUs vendidos no Mercado Livre cujo custo está zerado/ausente no canal ML
 * GET /api/admin/debug-skus-sem-custo?dias=30
 *
 * Retorna: sku, nome, marca, unidades vendidas, receita, ticket médio,
 *          custo_atual_ml (0), custos_outros_canais (pra deduzir)
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const dias = parseInt(searchParams.get('dias') || '30')

    const inicio = new Date(Date.now() - dias * 24 * 3600 * 1000)

    // Busca itens vendidos (orders confirmadas, não canceladas)
    const items = await prisma.order_items.findMany({
      where: {
        orders: {
          created_at: { gte: inicio },
          status: { not: 'cancelado' },
          origem: 'mercado_livre',
        },
        product_id: { not: null },
      },
      select: {
        product_id: true,
        quantidade: true,
        preco_unitario: true,
        preco_total: true,
        products: {
          select: {
            id: true,
            sku: true,
            nome: true,
            brands: { select: { nome: true } },
            product_prices: {
              select: { custo: true, canal: true, preco_venda: true },
            },
          },
        },
      },
    })

    // Agrupa por produto
    interface Ac {
      sku: string
      nome: string
      marca: string
      unidades: number
      receita: number
      pedidos: number
      custo_ml: number
      tem_preco_ml: boolean
      custos_outros: Record<string, number>
      precos_outros: Record<string, number>
    }
    const mapa = new Map<string, Ac>()

    for (const it of items) {
      if (!it.products) continue
      const id = it.products.id
      if (!mapa.has(id)) {
        const mlPrice = it.products.product_prices?.find((p) => p.canal === 'mercado_livre')
        const outros: Record<string, number> = {}
        const outrosPrecos: Record<string, number> = {}
        for (const p of it.products.product_prices || []) {
          if (p.canal !== 'mercado_livre') {
            outros[p.canal] = Number(p.custo || 0)
            outrosPrecos[p.canal] = Number(p.preco_venda || 0)
          }
        }
        mapa.set(id, {
          sku: it.products.sku || '(sem SKU)',
          nome: it.products.nome || '(sem nome)',
          marca: (it.products as any).brands?.nome || '—',
          unidades: 0,
          receita: 0,
          pedidos: 0,
          custo_ml: mlPrice ? Number(mlPrice.custo || 0) : 0,
          tem_preco_ml: !!mlPrice,
          custos_outros: outros,
          precos_outros: outrosPrecos,
        })
      }
      const a = mapa.get(id)!
      a.unidades += it.quantidade || 1
      a.receita += Number(it.preco_total || it.preco_unitario || 0)
      a.pedidos += 1
    }

    // Só os SEM custo ML (ou com custo 0)
    const semCusto = [...mapa.values()]
      .filter((a) => !a.tem_preco_ml || a.custo_ml === 0)
      .sort((a, b) => b.receita - a.receita)

    const totalGeral = [...mapa.values()]
    const receitaTotal = totalGeral.reduce((s, a) => s + a.receita, 0)
    const receitaSemCusto = semCusto.reduce((s, a) => s + a.receita, 0)

    return NextResponse.json({
      success: true,
      periodo_dias: dias,
      resumo: {
        skus_vendidos_total: totalGeral.length,
        skus_sem_custo_ml: semCusto.length,
        receita_total: Number(receitaTotal.toFixed(2)),
        receita_sem_custo_ml: Number(receitaSemCusto.toFixed(2)),
        pct_receita_sem_custo: receitaTotal > 0 ? Number(((receitaSemCusto / receitaTotal) * 100).toFixed(1)) : 0,
      },
      skus_sem_custo: semCusto.slice(0, 200),
    })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
