// GET /api/admin/relatorios/cross-sell?meses=6&min_support=1&top=50&marca_id=
// Market Basket Analysis: encontra pares de produtos que são comprados juntos
// Métricas:
// - Support: % de orders que contém ambos os produtos
// - Confidence A→B: % de clientes que compraram A e também compraram B
// - Lift: >1 = associação positiva, <1 = negativa
// Uso sugerido: combos no anúncio, recomendações no carrinho, kits

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const meses = Math.min(Number(searchParams.get('meses') || 6), 12)
    const minSupportPct = Number(searchParams.get('min_support') || 1) // % mínimo de suporte
    const top = Math.min(Number(searchParams.get('top') || 50), 200)
    const marcaId = searchParams.get('marca_id') // filtra pares onde A é desta marca
    const minLift = Number(searchParams.get('min_lift') || 1) // lift mínimo (default 1 = qualquer associação)

    const dataInicio = new Date()
    dataInicio.setMonth(dataInicio.getMonth() - meses)

    // Buscar orders com itens no período
    const orders = await prisma.orders.findMany({
      where: {
        created_at: { gte: dataInicio },
        status: { not: 'cancelado' },
        order_items: { some: {} },
      },
      select: {
        id: true,
        order_items: {
          select: {
            products: { select: { sku: true, nome: true, genero: true, marca_id: true, brands: { select: { id: true, nome: true } } } },
          },
        },
      },
    })

    const totalOrders = orders.length
    if (totalOrders === 0) {
      return NextResponse.json({ ok: true, total_orders: 0, pares: [], insights: [] })
    }

    // Conta ocorrências de cada produto
    const productCounts = new Map<string, { sku: string; nome: string; genero: string | null; marca: string | null; marca_id: string | null; count: number }>()
    for (const o of orders) {
      const skus = new Set(o.order_items.map((i) => i.products?.sku).filter(Boolean))
      for (const it of o.order_items) {
        const sku = it.products?.sku
        if (!sku) continue
        if (!productCounts.has(sku)) {
          productCounts.set(sku, {
            sku,
            nome: it.products?.nome || sku,
            genero: it.products?.genero || null,
            marca: it.products?.brands?.nome || null,
            marca_id: it.products?.brands?.id || null,
            count: 0,
          })
        }
        if (skus.has(sku)) productCounts.get(sku)!.count++
      }
    }

    // Conta pares
    const pairCounts = new Map<string, { sku_a: string; sku_b: string; count: number; orders: Set<string> }>()
    for (const o of orders) {
      const skus = Array.from(new Set(o.order_items.map((i) => i.products?.sku).filter(Boolean))).sort()
      for (let i = 0; i < skus.length; i++) {
        for (let j = i + 1; j < skus.length; j++) {
          const key = `${skus[i]}|${skus[j]}`
          if (!pairCounts.has(key)) {
            pairCounts.set(key, { sku_a: skus[i], sku_b: skus[j], count: 0, orders: new Set() })
          }
          const p = pairCounts.get(key)!
          p.count++
          p.orders.add(o.id)
        }
      }
    }

    // Calcula métricas
    const minSupport = minSupportPct / 100
    const pares: {
      sku_a: string; nome_a: string; marca_a: string; genero_a: string | null
      sku_b: string; nome_b: string; marca_b: string; genero_b: string | null
      orders_com_ambos: number
      orders_com_a: number
      orders_com_b: number
      support: number
      support_pct: number
      confidence_a_para_b: number
      confidence_b_para_a: number
      lift: number
      score: number // score composto: lift * support
    }[] = []

    for (const p of pairCounts.values()) {
      const pa = productCounts.get(p.sku_a)
      const pb = productCounts.get(p.sku_b)
      if (!pa || !pb) continue

      const support = p.orders.size / totalOrders
      if (support < minSupport) continue

      const supportA = pa.count / totalOrders
      const supportB = pb.count / totalOrders
      const lift = supportA > 0 && supportB > 0 ? support / (supportA * supportB) : 0
      if (lift < minLift) continue

      const confiancaAparaB = pa.count > 0 ? (p.orders.size / pa.count) * 100 : 0
      const confiancaBparaA = pb.count > 0 ? (p.orders.size / pb.count) * 100 : 0

      if (marcaId && pa.marca_id !== marcaId && pb.marca_id !== marcaId) continue

      pares.push({
        sku_a: p.sku_a, nome_a: pa.nome, marca_a: pa.marca || '—', genero_a: pa.genero,
        sku_b: p.sku_b, nome_b: pb.nome, marca_b: pb.marca || '—', genero_b: pb.genero,
        orders_com_ambos: p.orders.size,
        orders_com_a: pa.count,
        orders_com_b: pb.count,
        support,
        support_pct: Number((support * 100).toFixed(2)),
        confidence_a_para_b: Number(confiancaAparaB.toFixed(1)),
        confidence_b_para_a: Number(confiancaBparaA.toFixed(1)),
        lift: Number(lift.toFixed(2)),
        score: Number((lift * support * 100).toFixed(2)),
      })
    }

    // Ordena por score (combinação de lift e support)
    pares.sort((a, b) => b.score - a.score)
    const topPares = pares.slice(0, top)

    // Top combos entre marcas diferentes (cross-brand)
    const crossBrandPares = topPares
      .filter((p) => p.marca_a !== p.marca_b && p.marca_a !== '—' && p.marca_b !== '—')
      .slice(0, 20)

    // Top combos da mesma marca (line extension)
    const sameBrandPares = topPares
      .filter((p) => p.marca_a === p.marca_b && p.marca_a !== '—')
      .slice(0, 20)

    // Top 1 par geral
    const top1 = topPares[0]
    const insights: any[] = []
    if (top1) {
      insights.push({ emoji: '🏆', tipo: 'positivo', titulo: `Combo mais forte: ${top1.marca_a} + ${top1.marca_b}`, detalhe: `${top1.orders_com_ambos} pedidos com ambos (lift ${top1.lift.toFixed(2)}x, confiança ${Math.max(top1.confidence_a_para_b, top1.confidence_b_para_a).toFixed(0)}%)` })
    }
    if (crossBrandPares.length > 0) {
      const p = crossBrandPares[0]
      insights.push({ emoji: '🤝', tipo: 'positivo', titulo: `Cross-brand top: ${p.marca_a} ↔ ${p.marca_b}`, detalhe: `${p.orders_com_ambos} pedidos, lift ${p.lift.toFixed(2)}x. Crie kit ou combo com desconto.` })
    }
    if (sameBrandPares.length > 0) {
      const p = sameBrandPares[0]
      insights.push({ emoji: '📦', tipo: 'positivo', titulo: `Line extension: ${p.nome_a} + ${p.nome_b}`, detalhe: `Ambos ${p.marca_a}. ${p.orders_com_ambos} pedidos. Sugira como combo.` })
    }

    // Combos de cross-sell com público feminino
    const paresFeminino = topPares.filter((p) => p.genero_a === 'feminino' && p.genero_b === 'feminino').slice(0, 5)
    if (paresFeminino.length > 0) {
      const p = paresFeminino[0]
      insights.push({ emoji: '💄', tipo: 'positivo', titulo: `Combo feminino: ${p.marca_a} + ${p.marca_b}`, detalhe: `${p.orders_com_ambos} clientes femininos compraram ambos. Aumente exposição cruzada.` })
    }

    return NextResponse.json({
      ok: true,
      filtros: { meses, min_support_pct: minSupportPct, min_lift: minLift, marca_id: marcaId },
      total_orders: totalOrders,
      total_produtos_unicos: productCounts.size,
      total_pares_analisados: pairCounts.size,
      total_pares_acima_threshold: pares.length,
      top_pares: topPares,
      cross_brand: crossBrandPares,
      same_brand: sameBrandPares,
      insights,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message, stack: err.stack }, { status: 500 })
  }
}
