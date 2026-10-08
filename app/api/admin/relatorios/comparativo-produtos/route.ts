// GET /api/admin/relatorios/comparativo-produtos?sku_a=X&sku_b=Y&meses=6
// Compara 2 produtos (SKU) lado a lado:
// - KPIs: receita, unidades, pedidos únicos, preço médio, ticket médio
// - Custo, margem (se disponível)
// - % por gênero do público que compra
// - Top UFs e Cidades
// - Evolução mensal
// - Insights: onde A ganha / B ganha / empatam

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface OrderItem {
  quantidade: number
  preco_unitario: any
  preco_total: any
  nome_produto: string
  products: {
    genero: string | null
    sku: string
    nome: string
    ean: string | null
    brands: { id: string; nome: string } | null
    product_prices: { custo: any; preco_venda: any; canal: string }[]
  } | null
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const meses = Math.min(Number(searchParams.get('meses') || 6), 24)
    const skuA = searchParams.get('sku_a')?.trim()
    const skuB = searchParams.get('sku_b')?.trim()

    if (!skuA || !skuB) {
      return NextResponse.json({ ok: false, error: 'Informe sku_a e sku_b' }, { status: 400 })
    }
    if (skuA === skuB) {
      return NextResponse.json({ ok: false, error: 'Escolha SKUs diferentes' }, { status: 400 })
    }

    // Buscar metadata dos produtos
    const [prodA, prodB] = await Promise.all([
      prisma.products.findUnique({
        where: { sku: skuA },
        select: { id: true, sku: true, nome: true, genero: true, ean: true, marca_id: true, brands: { select: { nome: true } }, product_prices: { take: 1, orderBy: { preco_venda: 'desc' } } },
      }),
      prisma.products.findUnique({
        where: { sku: skuB },
        select: { id: true, sku: true, nome: true, genero: true, ean: true, marca_id: true, brands: { select: { nome: true } }, product_prices: { take: 1, orderBy: { preco_venda: 'desc' } } },
      }),
    ])

    if (!prodA || !prodB) {
      return NextResponse.json({ ok: false, error: !prodA ? `SKU ${skuA} não encontrado` : `SKU ${skuB} não encontrado` }, { status: 404 })
    }

    const dataInicio = new Date()
    dataInicio.setMonth(dataInicio.getMonth() - meses)

    // Buscar orders com esses SKUs
    const orders = await prisma.orders.findMany({
      where: {
        created_at: { gte: dataInicio },
        order_items: {
          some: { products: { sku: { in: [skuA, skuB] } } },
        },
      },
      select: {
        id: true,
        total: true,
        created_at: true,
        endereco_entrega: true,
        order_items: {
          where: { products: { sku: { in: [skuA, skuB] } } },
          select: {
            quantidade: true,
            preco_unitario: true,
            preco_total: true,
            nome_produto: true,
            products: { select: { genero: true, sku: true, nome: true, brands: { select: { id: true, nome: true } } } },
          },
        },
      },
    })

    // Agregadores
    interface GeneroCount { feminino: number; masculino: number; unissex: number; indefinido: number }
    interface ProdStats {
      pedidos: Set<string>
      unidades: number
      receita: number
      preco_total_vendido: number // soma de preco_unitario * qty (pra calcular preço médio real)
      ufs: Map<string, { pedidos: Set<string>; receita: number; unidades: number }>
      cidades: Map<string, { uf: string; cidade: string; pedidos: Set<string>; receita: number; unidades: number }>
      genero: GeneroCount
      evolucao: Map<string, { mes: string; pedidos: Set<string>; receita: number; unidades: number }>
    }
    const stats: Record<string, ProdStats> = {
      [skuA]: { pedidos: new Set(), unidades: 0, receita: 0, preco_total_vendido: 0, ufs: new Map(), cidades: new Map(), genero: { feminino: 0, masculino: 0, unissex: 0, indefinido: 0 }, evolucao: new Map() },
      [skuB]: { pedidos: new Set(), unidades: 0, receita: 0, preco_total_vendido: 0, ufs: new Map(), cidades: new Map(), genero: { feminino: 0, masculino: 0, unissex: 0, indefinido: 0 }, evolucao: new Map() },
    }

    for (const o of orders) {
      const end: any = o.endereco_entrega || {}
      const uf = (end.uf || '').toString().toUpperCase() || '—'
      const cidade = (end.cidade || '').toString().trim() || '—'
      const mesKey = o.created_at ? `${o.created_at.getFullYear()}-${String(o.created_at.getMonth() + 1).padStart(2, '0')}` : 'sem-data'

      for (const it of o.order_items) {
        const s = stats[it.products?.sku || '']
        if (!s) continue
        const qty = it.quantidade || 0
        const recItem = Number(it.preco_total || 0) || (Number(it.preco_unitario || 0) * qty)
        const precoUnit = Number(it.preco_unitario || 0)
        const g = (it.products?.genero || '').toLowerCase()
        const gFator = g === 'feminino' ? 'feminino' : g === 'masculino' ? 'masculino' : g === 'unissex' ? 'unissex' : 'indefinido'

        s.pedidos.add(o.id)
        s.unidades += qty
        s.receita += recItem
        s.preco_total_vendido += precoUnit * qty
        s.genero[gFator] += qty

        if (!s.ufs.has(uf)) s.ufs.set(uf, { pedidos: new Set(), receita: 0, unidades: 0 })
        const ufData = s.ufs.get(uf)!
        ufData.pedidos.add(o.id)
        ufData.receita += recItem
        ufData.unidades += qty

        const cidKey = `${uf}-${cidade}`
        if (!s.cidades.has(cidKey)) s.cidades.set(cidKey, { uf, cidade, pedidos: new Set(), receita: 0, unidades: 0 })
        const cidData = s.cidades.get(cidKey)!
        cidData.pedidos.add(o.id)
        cidData.receita += recItem
        cidData.unidades += qty

        if (!s.evolucao.has(mesKey)) s.evolucao.set(mesKey, { mes: mesKey, pedidos: new Set(), receita: 0, unidades: 0 })
        const mData = s.evolucao.get(mesKey)!
        mData.pedidos.add(o.id)
        mData.receita += recItem
        mData.unidades += qty
      }
    }

    // Calcula cross-sell entre os 2 produtos
    const ordersComA = new Set<string>()
    const ordersComB = new Set<string>()
    const ordersComAB = new Set<string>()
    for (const o of orders) {
      const skusInOrder = new Set(o.order_items.map((i) => i.products?.sku))
      if (skusInOrder.has(skuA)) ordersComA.add(o.id)
      if (skusInOrder.has(skuB)) ordersComB.add(o.id)
      if (skusInOrder.has(skuA) && skusInOrder.has(skuB)) ordersComAB.add(o.id)
    }

    // Função de build
    const buildSummary = (sku: string, prod: any) => {
      const s = stats[sku]
      const tg = s.genero.feminino + s.genero.masculino + s.genero.unissex + s.genero.indefinido
      const topUfEntry = Array.from(s.ufs.entries()).sort((a, b) => b[1].receita - a[1].receita)[0]
      const concentracao = topUfEntry ? (topUfEntry[1].receita / Math.max(s.receita, 1)) * 100 : 0
      const precoMedio = s.unidades > 0 ? s.preco_total_vendido / s.unidades : 0
      const custo = prod?.product_prices?.[0]?.custo ? Number(prod.product_prices[0].custo) : 0
      const margem = custo > 0 ? ((precoMedio - custo) / precoMedio) * 100 : 0

      return {
        sku,
        nome: prod?.nome || sku,
        marca: prod?.brands?.nome || 'Sem marca',
        genero: prod?.genero || null,
        ean: prod?.ean || null,
        pedidos: s.pedidos.size,
        unidades: s.unidades,
        receita: Number(s.receita.toFixed(2)),
        preco_medio: Number(precoMedio.toFixed(2)),
        ticket_medio: s.pedidos.size > 0 ? Number((s.receita / s.pedidos.size).toFixed(2)) : 0,
        custo: custo,
        margem_pct: Number(margem.toFixed(1)),
        pct_feminino: tg > 0 ? Number(((s.genero.feminino / tg) * 100).toFixed(1)) : 0,
        pct_masculino: tg > 0 ? Number(((s.genero.masculino / tg) * 100).toFixed(1)) : 0,
        pct_unissex: tg > 0 ? Number(((s.genero.unissex / tg) * 100).toFixed(1)) : 0,
        concentracao_uf: Number(concentracao.toFixed(1)),
        uf_principal: topUfEntry ? topUfEntry[0] : null,
        top_ufs: Array.from(s.ufs.entries()).sort((a, b) => b[1].receita - a[1].receita).slice(0, 10).map(([uf, d]) => ({ uf, pedidos: d.pedidos.size, receita: Number(d.receita.toFixed(2)), unidades: d.unidades, pct: Number(((d.receita / Math.max(s.receita, 1)) * 100).toFixed(1)) })),
        top_cidades: Array.from(s.cidades.values()).sort((a, b) => b.receita - a.receita).slice(0, 10).map((c) => ({ cidade: c.cidade, uf: c.uf, pedidos: c.pedidos.size, receita: Number(c.receita.toFixed(2)), unidades: c.unidades })),
        evolucao: Array.from(s.evolucao.values()).sort((a, b) => a.mes.localeCompare(b.mes)).map((m) => ({ mes: m.mes, pedidos: m.pedidos.size, receita: Number(m.receita.toFixed(2)), unidades: m.unidades })),
      }
    }

    const sumA = buildSummary(skuA, prodA)
    const sumB = buildSummary(skuB, prodB)

    // Cross-sell entre os 2
    const totalOrdersComAOuB = ordersComA.size + ordersComB.size - ordersComAB.size
    const supportA = orders.length > 0 ? ordersComA.size / orders.length : 0
    const supportB = orders.length > 0 ? ordersComB.size / orders.length : 0
    const supportAB = orders.length > 0 ? ordersComAB.size / orders.length : 0
    const lift = supportA > 0 && supportB > 0 ? supportAB / (supportA * supportB) : 0
    const confiancaAparaB = ordersComA.size > 0 ? (ordersComAB.size / ordersComA.size) * 100 : 0
    const confiancaBparaA = ordersComB.size > 0 ? (ordersComAB.size / ordersComB.size) * 100 : 0

    // Comparativo por UF
    const allUfs = new Set([...sumA.top_ufs.map((u) => u.uf), ...sumB.top_ufs.map((u) => u.uf)])
    const comparativoUfs: { uf: string; receita_a: number; receita_b: number; vencedor: 'A' | 'B' | 'empate'; diff_pct: number }[] = []
    for (const uf of allUfs) {
      const recA = stats[skuA].ufs.get(uf)?.receita || 0
      const recB = stats[skuB].ufs.get(uf)?.receita || 0
      const max = Math.max(recA, recB)
      const min = Math.min(recA, recB)
      const diffPct = max > 0 ? ((max - min) / max) * 100 : 0
      const vencedor = recA > recB * 1.2 ? 'A' : recB > recA * 1.2 ? 'B' : 'empate'
      comparativoUfs.push({ uf, receita_a: Number(recA.toFixed(2)), receita_b: Number(recB.toFixed(2)), vencedor, diff_pct: Number(diffPct.toFixed(1)) })
    }
    comparativoUfs.sort((a, b) => Math.max(b.receita_a, b.receita_b) - Math.max(a.receita_a, a.receita_b))

    // Insights
    const insights: any[] = []
    if (sumA.receita > 0 && sumB.receita > 0) {
      const ratio = sumA.receita / sumB.receita
      if (ratio > 1.5) insights.push({ emoji: '🏆', tipo: 'positivo', titulo: `${sumA.nome} vende ${ratio.toFixed(1)}x mais`, detalhe: `${sumA.receita.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} vs ${sumB.receita.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`, marca: 'A' })
      else if (ratio < 0.67) insights.push({ emoji: '🏆', tipo: 'positivo', titulo: `${sumB.nome} vende ${(1 / ratio).toFixed(1)}x mais`, detalhe: `${sumB.receita.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} vs ${sumA.receita.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`, marca: 'B' })
    }
    if (sumA.preco_medio > 0 && sumB.preco_medio > 0) {
      const ratio = sumA.preco_medio / sumB.preco_medio
      if (ratio > 1.3) insights.push({ emoji: '💎', tipo: 'info', titulo: `${sumA.nome} é mais premium`, detalhe: `Preço médio R$ ${sumA.preco_medio.toFixed(2)} vs R$ ${sumB.preco_medio.toFixed(2)} (${ratio.toFixed(1)}x)`, marca: 'A' })
      else if (ratio < 0.77) insights.push({ emoji: '💎', tipo: 'info', titulo: `${sumB.nome} é mais premium`, detalhe: `Preço médio R$ ${sumB.preco_medio.toFixed(2)} vs R$ ${sumA.preco_medio.toFixed(2)} (${(1 / ratio).toFixed(1)}x)`, marca: 'B' })
    }
    if (sumA.margem_pct > 0 && sumB.margem_pct > 0 && Math.abs(sumA.margem_pct - sumB.margem_pct) > 5) {
      const melhor = sumA.margem_pct > sumB.margem_pct ? sumA : sumB
      const outro = sumA.margem_pct > sumB.margem_pct ? sumB : sumA
      insights.push({ emoji: '💰', tipo: 'positivo', titulo: `${melhor.nome} tem margem ${(melhor.margem_pct - outro.margem_pct).toFixed(0)}pp maior`, detalhe: `${melhor.margem_pct.toFixed(0)}% vs ${outro.margem_pct.toFixed(0)}%`, marca: sumA.margem_pct > sumB.margem_pct ? 'A' : 'B' })
    }
    if (ordersComAB.size > 0) {
      insights.push({ emoji: '🤝', tipo: 'positivo', titulo: `Cross-sell detectado: ${ordersComAB.size} pedidos com ambos`, detalhe: `Lift: ${lift.toFixed(2)}x, confiança A→B: ${confiancaAparaB.toFixed(1)}%, B→A: ${confiancaBparaA.toFixed(1)}%` })
    }

    return NextResponse.json({
      ok: true,
      filtros: { meses, sku_a: skuA, sku_b: skuB },
      produto_a: sumA,
      produto_b: sumB,
      cross_sell: {
        orders_com_a: ordersComA.size,
        orders_com_b: ordersComB.size,
        orders_com_ambos: ordersComAB.size,
        suporte_a: Number((supportA * 100).toFixed(2)),
        suporte_b: Number((supportB * 100).toFixed(2)),
        suporte_ambos: Number((supportAB * 100).toFixed(2)),
        lift: Number(lift.toFixed(2)),
        confianca_a_para_b_pct: Number(confiancaAparaB.toFixed(1)),
        confianca_b_para_a_pct: Number(confiancaBparaA.toFixed(1)),
      },
      comparativo: {
        receita_diff_pct: sumA.receita > 0 && sumB.receita > 0 ? Number((((sumA.receita - sumB.receita) / Math.max(sumA.receita, sumB.receita)) * 100).toFixed(1)) : 0,
        preco_medio_diff_pct: sumA.preco_medio > 0 && sumB.preco_medio > 0 ? Number((((sumA.preco_medio - sumB.preco_medio) / Math.max(sumA.preco_medio, sumB.preco_medio)) * 100).toFixed(1)) : 0,
        ufs_onde_a_ganha: comparativoUfs.filter((c) => c.vencedor === 'A').slice(0, 5),
        ufs_onde_b_ganha: comparativoUfs.filter((c) => c.vencedor === 'B').slice(0, 5),
        ufs_empatadas: comparativoUfs.filter((c) => c.vencedor === 'empate').slice(0, 5),
        ufs_total: comparativoUfs.length,
      },
      insights,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message, stack: err.stack }, { status: 500 })
  }
}
