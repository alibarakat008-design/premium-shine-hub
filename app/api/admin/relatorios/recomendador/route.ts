// GET /api/admin/relatorios/recomendador?cliente_id=X&limit=200
// Recomenda produtos pra cada cliente baseado em:
// 1. Cross-sell: produtos que são comprados junto com o que ele já comprou
// 2. Mesma marca: outros produtos da marca preferida
// 3. Mesmo gênero: produtos femininos/masculinos/unissex
// 4. Faixa de preço: ticket médio similar
// Score combinado: cross_sell_score * 0.5 + marca_score * 0.2 + genero_score * 0.2 + preco_score * 0.1

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const clienteId = searchParams.get('cliente_id')
    const limit = Math.min(Number(searchParams.get('limit') || 200), 500)
    const topPorCliente = Math.min(Number(searchParams.get('top_por_cliente') || 5), 20)
    const meses = Math.min(Number(searchParams.get('meses') || 6), 12)

    const dataInicio = new Date()
    dataInicio.setMonth(dataInicio.getMonth() - meses)

    // 1) Calcular cross-sell pairs no período
    const orders = await prisma.orders.findMany({
      where: {
        created_at: { gte: dataInicio },
        status: { not: 'cancelado' },
        order_items: { some: {} },
      },
      select: {
        id: true,
        order_items: { select: { products: { select: { sku: true, brands: { select: { id: true, nome: true } }, genero: true } } } },
      },
    })

    // Cross-sell: conta pares
    const productCount = new Map<string, number>()
    const pairCount = new Map<string, number>()
    for (const o of orders) {
      const skus = Array.from(new Set(o.order_items.map((i) => i.products?.sku).filter(Boolean)))
      for (const sku of skus) {
        productCount.set(sku, (productCount.get(sku) || 0) + 1)
      }
      for (let i = 0; i < skus.length; i++) {
        for (let j = i + 1; j < skus.length; j++) {
          const key = `${skus[i]}|${skus[j]}`
          pairCount.set(key, (pairCount.get(key) || 0) + 1)
        }
      }
    }

    // 2) Buscar metadata produtos
    const allSkus = Array.from(productCount.keys())
    const productsMeta = await prisma.products.findMany({
      where: { sku: { in: allSkus } },
      select: {
        id: true, sku: true, nome: true, genero: true, marca_id: true,
        brands: { select: { id: true, nome: true } },
        product_prices: { take: 1, orderBy: { preco_venda: 'desc' }, select: { preco_venda: true } },
      },
    })
    const productMap = new Map(productsMeta.map((p) => [p.sku, p]))

    // 3) Calcular top produtos por marca (pra "também da marca X")
    const produtosPorMarca = new Map<string, { sku: string; count: number; receita: number }[]>()
    for (const sku of allSkus) {
      const p = productMap.get(sku)
      if (!p?.brands) continue
      const mId = p.brands.id
      if (!produtosPorMarca.has(mId)) produtosPorMarca.set(mId, [])
      produtosPorMarca.get(mId)!.push({ sku, count: productCount.get(sku) || 0, receita: 0 })
    }

    // 4) Pra cada cliente com pedido recente, gerar recomendações
    const customers = await prisma.customers.findMany({
      where: clienteId ? { id: clienteId } : { orders: { some: { created_at: { gte: dataInicio } } } },
      select: {
        id: true,
        nome: true,
        email: true,
        telefone: true,
        orders: {
          where: { created_at: { gte: dataInicio }, status: { not: 'cancelado' } },
          orderBy: { created_at: 'desc' },
          take: 20,
          select: {
            id: true,
            total: true,
            order_items: {
              select: {
                quantidade: true,
                products: { select: { sku: true, nome: true, genero: true, brands: { select: { id: true, nome: true } }, product_prices: { take: 1, orderBy: { preco_venda: 'desc' }, select: { preco_venda: true } } } },
              },
            },
          },
        },
      },
      take: clienteId ? 1 : limit,
    })

    type Rec = {
      sku: string
      nome: string
      marca: string
      genero: string | null
      preco: number
      score: number
      motivo: string
      lift: number
    }

    const recomendacoesPorCliente: any[] = []

    for (const c of customers) {
      if (c.orders.length === 0) continue

      // Coleta SKUs que o cliente JÁ comprou
      const skusJaComprados = new Set<string>()
      let ticketMedio = 0
      let totalPedidos = 0
      const marcasPreferidas = new Map<string, number>()
      const generosPreferidos = new Map<string, number>()

      for (const o of c.orders) {
        ticketMedio += Number(o.total || 0)
        totalPedidos++
        for (const it of o.order_items) {
          if (it.products?.sku) skusJaComprados.add(it.products.sku)
          if (it.products?.brands?.id) {
            marcasPreferidas.set(it.products.brands.id, (marcasPreferidas.get(it.products.brands.id) || 0) + it.quantidade)
          }
          if (it.products?.genero) {
            generosPreferidos.set(it.products.genero, (generosPreferidos.get(it.products.genero) || 0) + it.quantidade)
          }
        }
      }
      ticketMedio = totalPedidos > 0 ? ticketMedio / totalPedidos : 0

      // Calcula scores
      const scores = new Map<string, { score: number; motivos: string[]; lift: number }>()

      for (const sku of skusJaComprados) {
        const prod = productMap.get(sku)
        if (!prod) continue

        // 1) Cross-sell: encontra produtos que aparecem junto com esse SKU
        for (const [pairKey, count] of pairCount) {
          const [a, b] = pairKey.split('|')
          let otherSku: string | null = null
          if (a === sku) otherSku = b
          else if (b === sku) otherSku = a
          if (!otherSku || skusJaComprados.has(otherSku)) continue

          const otherProd = productMap.get(otherSku)
          if (!otherProd) continue

          const pa = productCount.get(sku) || 0
          const pb = productCount.get(otherSku) || 0
          const lift = pa > 0 && pb > 0 ? (count / orders.length) / ((pa / orders.length) * (pb / orders.length)) : 0
          const csScore = Math.min(1, lift / 3) * 0.5

          if (!scores.has(otherSku)) scores.set(otherSku, { score: 0, motivos: [], lift: 0 })
          const s = scores.get(otherSku)!
          s.score += csScore
          s.lift = Math.max(s.lift, lift)
          if (lift >= 2) s.motivos.push(`Cross-sell ${lift.toFixed(1)}x com ${prod.nome.slice(0, 20)}`)
        }
      }

      // 2) Mesma marca preferida
      for (const [mId, count] of marcasPreferidas) {
        const produtos = produtosPorMarca.get(mId) || []
        for (const p of produtos) {
          if (skusJaComprados.has(p.sku)) continue
          const prod = productMap.get(p.sku)
          if (!prod) continue
          const mScore = Math.min(0.2, (count / totalPedidos) * 0.05)
          if (!scores.has(p.sku)) scores.set(p.sku, { score: 0, motivos: [], lift: 0 })
          const s = scores.get(p.sku)!
          s.score += mScore
          if (mScore > 0.1) s.motivos.push(`Marca preferida ${prod.brands?.nome}`)
        }
      }

      // 3) Mesmo gênero
      for (const [g, count] of generosPreferidos) {
        for (const sku of allSkus) {
          const prod = productMap.get(sku)
          if (!prod || prod.genero !== g || skusJaComprados.has(sku)) continue
          const gScore = Math.min(0.2, (count / totalPedidos) * 0.05)
          if (!scores.has(sku)) scores.set(sku, { score: 0, motivos: [], lift: 0 })
          const s = scores.get(sku)!
          s.score += gScore
          if (gScore > 0.1) s.motivos.push(`Gênero ${g}`)
        }
      }

      // 4) Faixa de preço (preço similar ao ticket)
      if (ticketMedio > 0) {
        for (const sku of allSkus) {
          const prod = productMap.get(sku)
          if (!prod || skusJaComprados.has(sku)) continue
          const preco = Number(prod.product_prices?.[0]?.preco_venda || 0)
          if (preco === 0) continue
          const ratio = preco / ticketMedio
          if (ratio >= 0.5 && ratio <= 2) {
            const pScore = (1 - Math.abs(Math.log(ratio)) / Math.log(2)) * 0.1
            if (!scores.has(sku)) scores.set(sku, { score: 0, motivos: [], lift: 0 })
            const s = scores.get(sku)!
            s.score += pScore
            if (pScore > 0.05) s.motivos.push(`Faixa de preço similar`)
          }
        }
      }

      // Ordena e pega top N
      const sorted = Array.from(scores.entries())
        .sort((a, b) => b[1].score - a[1].score)
        .slice(0, topPorCliente)
        .filter(([, s]) => s.score > 0)

      const recs: Rec[] = sorted.map(([sku, s]) => {
        const prod = productMap.get(sku)!
        return {
          sku,
          nome: prod.nome,
          marca: prod.brands?.nome || '—',
          genero: prod.genero,
          preco: Number(prod.product_prices?.[0]?.preco_venda || 0),
          score: Number((s.score * 100).toFixed(1)),
          motivo: s.motivos[0] || 'Recomendação',
          lift: Number(s.lift.toFixed(2)),
        }
      })

      if (recs.length > 0) {
        recomendacoesPorCliente.push({
          cliente_id: c.id,
          cliente_nome: c.nome,
          cliente_telefone: c.telefone,
          cliente_email: c.email,
          total_pedidos: totalPedidos,
          ticket_medio: Number(ticketMedio.toFixed(2)),
          marcas_preferidas: Array.from(marcasPreferidas.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([mId]) => productMap.get(Array.from(productMap.values()).find((p) => p.brands?.id === mId)?.sku || '')?.brands?.nome || mId),
          generos_preferidos: Array.from(generosPreferidos.entries()).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([g]) => g),
          recomendacoes: recs,
        })
      }
    }

    return NextResponse.json({
      ok: true,
      total_clientes: recomendacoesPorCliente.length,
      clientes: recomendacoesPorCliente,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message, stack: err.stack }, { status: 500 })
  }
}
