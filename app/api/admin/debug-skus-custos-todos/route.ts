import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * Lista SKUs vendidos no Mercado Livre COM TODOS os product_prices por canal
 * (pra mostrar onde o custo ML diverge do que está cadastrado)
 * GET /api/admin/debug-skus-custos-todos?dias=30
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const dias = parseInt(searchParams.get('dias') || '30')
    const soDivergentes = searchParams.get('divergentes') === '1'

    const inicio = new Date(Date.now() - dias * 24 * 3600 * 1000)

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

    interface Ac {
      sku: string
      nome: string
      marca: string
      unidades: number
      receita: number
      custos: Record<string, number>
      precos: Record<string, number>
      tem_ml: boolean
    }
    const mapa = new Map<string, Ac>()

    for (const it of items) {
      if (!it.products) continue
      const id = it.products.id
      if (!mapa.has(id)) {
        const custos: Record<string, number> = {}
        const precos: Record<string, number> = {}
        for (const p of it.products.product_prices || []) {
          if (p.canal) {
            custos[p.canal] = Number(p.custo || 0)
            precos[p.canal] = Number(p.preco_venda || 0)
          }
        }
        mapa.set(id, {
          sku: it.products.sku || '(sem SKU)',
          nome: it.products.nome || '(sem nome)',
          marca: (it.products as any).brands?.nome || '—',
          unidades: 0,
          receita: 0,
          custos,
          precos,
          tem_ml: 'mercado_livre' in custos,
        })
      }
      const a = mapa.get(id)!
      a.unidades += it.quantidade || 1
      a.receita += Number(it.preco_total || 0)
    }

    // Detectar divergências: tem custo ML diferente de outros canais
    let lista = [...mapa.values()].sort((a, b) => b.receita - a.receita)

    if (soDivergentes) {
      lista = lista.filter((a) => {
        if (!a.tem_ml) return false
        const ml = a.custos['mercado_livre']
        const outros = Object.entries(a.custos).filter(([c]) => c !== 'mercado_livre')
        if (outros.length === 0) return false
        // Divergente se custo ML != algum outro com diferença > 1 centavo
        return outros.some(([_, v]) => Math.abs(v - ml) > 0.01)
      })
    }

    // Resumo
    const totalSkus = [...mapa.values()].length
    const semCustoMl = [...mapa.values()].filter((a) => !a.tem_ml).length
    const divergentes = [...mapa.values()].filter((a) => {
      if (!a.tem_ml) return false
      const ml = a.custos['mercado_livre']
      const outros = Object.entries(a.custos).filter(([c]) => c !== 'mercado_livre')
      return outros.some(([_, v]) => Math.abs(v - ml) > 0.01)
    }).length

    return NextResponse.json({
      success: true,
      periodo_dias: dias,
      resumo: {
        skus_total: totalSkus,
        sem_custo_ml: semCustoMl,
        com_custo_ml_divergente: divergentes,
      },
      lista: lista.slice(0, 200),
    })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
