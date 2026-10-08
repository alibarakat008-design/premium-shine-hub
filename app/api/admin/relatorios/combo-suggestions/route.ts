// GET /api/admin/relatorios/combo-suggestions?meses=6&margem_min=20&max_desconto=20&min_lift=1.5
// Pra cada par de cross-sell detectado, sugere preço de combo:
// - Calcula desconto baseado em lift
// - Garante margem mínima
// - Mostra lucro do combo vs vendido separado
// - ROI estimado baseado em orders_com_ambos

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const meses = Math.min(Number(searchParams.get('meses') || 6), 12)
    const margemMinPct = Number(searchParams.get('margem_min') || 20) // margem mínima desejada
    const maxDescontoPct = Number(searchParams.get('max_desconto') || 20) // desconto máximo permitido
    const minLift = Number(searchParams.get('min_lift') || 1.5)

    const dataInicio = new Date()
    dataInicio.setMonth(dataInicio.getMonth() - meses)

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
            products: { select: { sku: true, nome: true, brands: { select: { nome: true } }, product_prices: { take: 1, orderBy: { preco_venda: 'desc' } } } },
          },
        },
      },
    })

    const totalOrders = orders.length
    if (totalOrders === 0) {
      return NextResponse.json({ ok: true, total_combos: 0, combos: [], insights: [] })
    }

    // Count produtos
    const productCounts = new Map<string, { count: number }>()
    for (const o of orders) {
      const skus = new Set(o.order_items.map((i) => i.products?.sku).filter(Boolean))
      for (const it of o.order_items) {
        const sku = it.products?.sku
        if (!sku) continue
        if (!productCounts.has(sku)) productCounts.set(sku, { count: 0 })
        if (skus.has(sku)) productCounts.get(sku)!.count++
      }
    }

    // Count pares
    const pairCounts = new Map<string, { count: number; orders: Set<string> }>()
    for (const o of orders) {
      const skus = Array.from(new Set(o.order_items.map((i) => i.products?.sku).filter(Boolean))).sort()
      for (let i = 0; i < skus.length; i++) {
        for (let j = i + 1; j < skus.length; j++) {
          const key = `${skus[i]}|${skus[j]}`
          if (!pairCounts.has(key)) pairCounts.set(key, { count: 0, orders: new Set() })
          const p = pairCounts.get(key)!
          p.count++
          p.orders.add(o.id)
        }
      }
    }

    // Buscar metadata produtos em batch
    const allSkus = Array.from(new Set([...Array.from(productCounts.keys()), ...Array.from(pairCounts.keys()).flatMap((k) => k.split('|'))]))
    const products = await prisma.products.findMany({
      where: { sku: { in: allSkus } },
      select: {
        id: true, sku: true, nome: true, genero: true, marca_id: true,
        brands: { select: { id: true, nome: true } },
        product_prices: { take: 1, orderBy: { preco_venda: 'desc' }, select: { custo: true, preco_venda: true, preco_promocional: true } },
      },
    })
    const productMap = new Map(products.map((p) => [p.sku, p]))

    type Combo = {
      sku_a: string; nome_a: string; marca_a: string
      sku_b: string; nome_b: string; marca_b: string
      orders_com_ambos: number
      lift: number
      confianca_pct: number
      preco_a: number
      preco_b: number
      custo_a: number
      custo_b: number
      preco_separado: number
      custo_total: number
      margem_atual_pct: number
      desconto_sugerido_pct: number
      preco_combo: number
      economia_cliente: number
      margem_combo_pct: number
      lucro_por_combo: number
      receita_potencial_mensal: number
      lucro_potencial_mensal: number
      roi_estimado_pct: number
      urgencia: 'forte' | 'media' | 'fraca'
    }

    const combos: Combo[] = []

    for (const [key, p] of pairCounts) {
      const [skuA, skuB] = key.split('|')
      const prodA = productMap.get(skuA)
      const prodB = productMap.get(skuB)
      if (!prodA || !prodB) continue

      const pa = productCounts.get(skuA)
      const pb = productCounts.get(skuB)
      if (!pa || !pb) continue

      const supportAB = p.orders.size / totalOrders
      const supportA = pa.count / totalOrders
      const supportB = pb.count / totalOrders
      const lift = supportA > 0 && supportB > 0 ? supportAB / (supportA * supportB) : 0
      if (lift < minLift) continue

      // Preços
      const precoA = Number(prodA.product_prices?.[0]?.preco_venda || 0)
      const precoB = Number(prodB.product_prices?.[0]?.preco_venda || 0)
      const custoA = Number(prodA.product_prices?.[0]?.custo || 0)
      const custoB = Number(prodB.product_prices?.[0]?.custo || 0)
      if (precoA === 0 || precoB === 0) continue

      const precoSeparado = precoA + precoB
      const custoTotal = custoA + custoB
      const margemAtual = precoSeparado > 0 ? ((precoSeparado - custoTotal) / precoSeparado) * 100 : 0

      // Desconto sugerido baseado em lift:
      // - lift 1.5x → 5% desconto
      // - lift 2.0x → 10%
      // - lift 3.0x → 15%
      // - lift 5.0x+ → 20% (max)
      let descontoBase = 0
      if (lift >= 5) descontoBase = 20
      else if (lift >= 3) descontoBase = 15
      else if (lift >= 2) descontoBase = 10
      else descontoBase = 5

      // Ajusta pra garantir margem mínima
      // Margem desejada: (preco_combo - custo) / preco_combo = margemMin / 100
      // preco_combo = custo / (1 - margemMin/100)
      const precoMinimoPorMargem = custoTotal / (1 - margemMinPct / 100)
      const descontoMaxPorMargem = precoSeparado > 0 ? ((precoSeparado - precoMinimoPorMargem) / precoSeparado) * 100 : 0
      const descontoFinal = Math.min(descontoBase, maxDescontoPct, descontoMaxPorMargem)

      const precoCombo = precoSeparado * (1 - descontoFinal / 100)
      const economia = precoSeparado - precoCombo
      const margemCombo = precoCombo > 0 ? ((precoCombo - custoTotal) / precoCombo) * 100 : 0
      const lucroPorCombo = precoCombo - custoTotal

      // Receita potencial: se cross-sell convertesse X% dos orders_com_a em combo
      const conversaoEstimada = 0.3 // 30% de conversão estimada
      const ordersComA = pa.count
      const combosPotenciais = Math.round(ordersComA * conversaoEstimada)
      const receitaPotencial = combosPotenciais * precoCombo
      const lucroPotencial = combosPotenciais * lucroPorCombo
      const receitaSeparado = ordersComA * precoSeparado * 0.3 // comparação
      const roi = receitaSeparado > 0 ? ((receitaPotencial - receitaSeparado) / receitaSeparado) * 100 : 0

      const urgencia: 'forte' | 'media' | 'fraca' = lift >= 3 ? 'forte' : lift >= 2 ? 'media' : 'fraca'

      combos.push({
        sku_a: skuA, nome_a: prodA.nome, marca_a: prodA.brands?.nome || '—',
        sku_b: skuB, nome_b: prodB.nome, marca_b: prodB.brands?.nome || '—',
        orders_com_ambos: p.orders.size,
        lift: Number(lift.toFixed(2)),
        confianca_pct: Number(((p.orders.size / pa.count) * 100).toFixed(1)),
        preco_a: precoA, preco_b: precoB,
        custo_a: custoA, custo_b: custoB,
        preco_separado: Number(precoSeparado.toFixed(2)),
        custo_total: Number(custoTotal.toFixed(2)),
        margem_atual_pct: Number(margemAtual.toFixed(1)),
        desconto_sugerido_pct: Number(descontoFinal.toFixed(1)),
        preco_combo: Number(precoCombo.toFixed(2)),
        economia_cliente: Number(economia.toFixed(2)),
        margem_combo_pct: Number(margemCombo.toFixed(1)),
        lucro_por_combo: Number(lucroPorCombo.toFixed(2)),
        receita_potencial_mensal: Number(receitaPotencial.toFixed(2)),
        lucro_potencial_mensal: Number(lucroPotencial.toFixed(2)),
        roi_estimado_pct: Number(roi.toFixed(1)),
        urgencia,
      })
    }

    combos.sort((a, b) => b.lucro_potencial_mensal - a.lucro_potencial_mensal)
    const topCombos = combos.slice(0, 100)

    // Insights
    const insights: any[] = []
    if (topCombos.length > 0) {
      const top1 = topCombos[0]
      insights.push({
        emoji: '🏆',
        tipo: 'positivo',
        titulo: `Combo mais lucrativo: ${top1.marca_a} + ${top1.marca_b}`,
        detalhe: `Potencial de ${top1.receita_potencial_mensal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} receita e ${top1.lucro_potencial_mensal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} lucro no mês. Lift ${top1.lift}x, combo a R$ ${top1.preco_combo.toFixed(2)} (${top1.desconto_sugerido_pct.toFixed(0)}% off).`,
      })
    }
    const crossBrand = topCombos.filter((c) => c.marca_a !== c.marca_b).slice(0, 3)
    if (crossBrand.length > 0) {
      const c = crossBrand[0]
      insights.push({
        emoji: '🔀',
        tipo: 'positivo',
        titulo: `Cross-brand top: ${c.marca_a} + ${c.marca_b}`,
        detalhe: `Lift ${c.lift}x, combo sugerido a R$ ${c.preco_combo.toFixed(2)}. Margem mantida em ${c.margem_combo_pct.toFixed(0)}%`,
      })
    }
    const altaMargem = topCombos.filter((c) => c.margem_combo_pct >= 30).slice(0, 3)
    if (altaMargem.length > 0) {
      const c = altaMargem[0]
      insights.push({
        emoji: '💎',
        tipo: 'positivo',
        titulo: `Combo premium: ${c.nome_a} + ${c.nome_b}`,
        detalhe: `Margem de ${c.margem_combo_pct.toFixed(0)}% mesmo com ${c.desconto_sugerido_pct.toFixed(0)}% de desconto. Clientes já pagariam caro mesmo sem combo.`,
      })
    }
    const altaConversao = topCombos.filter((c) => c.confianca_pct >= 30).slice(0, 3)
    if (altaConversao.length > 0) {
      const c = altaConversao[0]
      insights.push({
        emoji: '🎯',
        tipo: 'positivo',
        titulo: `Alta afinidade: ${c.nome_a} + ${c.nome_b}`,
        detalhe: `${c.confianca_pct.toFixed(0)}% dos clientes que compram ${c.nome_a} também compram ${c.nome_b}. Combo praticamente garantido.`,
      })
    }

    // Resumo
    const receitaPotencialTotal = topCombos.reduce((s, c) => s + c.receita_potencial_mensal, 0)
    const lucroPotencialTotal = topCombos.reduce((s, c) => s + c.lucro_potencial_mensal, 0)

    return NextResponse.json({
      ok: true,
      filtros: { meses, margem_min_pct: margemMinPct, max_desconto_pct: maxDescontoPct, min_lift: minLift },
      total_combos: combos.length,
      total_orders_analisadas: totalOrders,
      resumo: {
        receita_potencial_total: Number(receitaPotencialTotal.toFixed(2)),
        lucro_potencial_total: Number(lucroPotencialTotal.toFixed(2)),
        desconto_medio: combos.length > 0 ? Number((combos.reduce((s, c) => s + c.desconto_sugerido_pct, 0) / combos.length).toFixed(1)) : 0,
        margem_media: combos.length > 0 ? Number((combos.reduce((s, c) => s + c.margem_combo_pct, 0) / combos.length).toFixed(1)) : 0,
      },
      combos: topCombos,
      insights,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message, stack: err.stack }, { status: 500 })
  }
}
