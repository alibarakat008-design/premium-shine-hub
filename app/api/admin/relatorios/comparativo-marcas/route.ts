// GET /api/admin/relatorios/comparativo-marcas?marca_a=ISABELLE LA BELLE&marca_b=BARBOURS&meses=6
// Retorna dados comparativos entre 2 marcas:
// - KPIs lado a lado (receita, pedidos, ticket médio, unidades, % genero)
// - Top UFs (com % de cada marca)
// - Top Cidades
// - Top Produtos
// - Evolução mensal (6 meses)
// - Insights: onde A ganha / onde B ganha / onde empatam
// - Concentração geográfica
// - Perfil de preço médio

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
    preco_custo: any
    brands: { id: string; nome: string } | null
  } | null
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const meses = Math.min(Number(searchParams.get('meses') || 6), 24)
    const marcaANome = searchParams.get('marca_a')?.toUpperCase().trim()
    const marcaBNome = searchParams.get('marca_b')?.toUpperCase().trim()

    if (!marcaANome || !marcaBNome) {
      return NextResponse.json({ ok: false, error: 'Informe marca_a e marca_b' }, { status: 400 })
    }
    if (marcaANome === marcaBNome) {
      return NextResponse.json({ ok: false, error: 'Escolha marcas diferentes' }, { status: 400 })
    }

    const dataInicio = new Date()
    dataInicio.setMonth(dataInicio.getMonth() - meses)

    // Buscar todas orders com itens das 2 marcas
    const orders = await prisma.orders.findMany({
      where: {
        created_at: { gte: dataInicio },
        order_items: {
          some: {
            products: {
              brands: { nome: { in: [marcaANome, marcaBNome] } },
            },
          },
        },
      },
      select: {
        id: true,
        total: true,
        created_at: true,
        endereco_entrega: true,
        order_items: {
          where: {
            products: {
              brands: { nome: { in: [marcaANome, marcaBNome] } },
            },
          },
          select: {
            quantidade: true,
            preco_unitario: true,
            preco_total: true,
            nome_produto: true,
            products: {
              select: {
                genero: true,
                sku: true,
                nome: true,
                brands: { select: { id: true, nome: true } },
              },
            },
          },
        },
      },
    })

    // Detectar nomes reais (case-insensitive)
    const marcaANomeReal = orders.flatMap((o) => o.order_items).map((i) => i.products?.brands?.nome).find((n) => n?.toUpperCase() === marcaANome) || marcaANome
    const marcaBNomeReal = orders.flatMap((o) => o.order_items).map((i) => i.products?.brands?.nome).find((n) => n?.toUpperCase() === marcaBNome) || marcaBNome

    // ===== Agregadores por marca =====
    interface GeneroCount { feminino: number; masculino: number; unissex: number; indefinido: number }
    interface MarcaStats {
      pedidos: number // orders distintas
      itens: number // quantidade de itens vendidos
      receita: number
      preco_medio: number
      ufs: Map<string, { pedidos: number; receita: number; unidades: number }>
      cidades: Map<string, { uf: string; cidade: string; pedidos: number; receita: number; unidades: number }>
      produtos: Map<string, { sku: string; nome: string; unidades: number; receita: number; preco_medio: number }>
      genero: GeneroCount
      evolucao: Map<string, { mes: string; pedidos: number; receita: number; unidades: number }> // "YYYY-MM"
    }
    const stats: Record<string, MarcaStats> = {
      [marcaANomeReal]: { pedidos: 0, itens: 0, receita: 0, preco_medio: 0, ufs: new Map(), cidades: new Map(), produtos: new Map(), genero: { feminino: 0, masculino: 0, unissex: 0, indefinido: 0 }, evolucao: new Map() },
      [marcaBNomeReal]: { pedidos: 0, itens: 0, receita: 0, preco_medio: 0, ufs: new Map(), cidades: new Map(), produtos: new Map(), genero: { feminino: 0, masculino: 0, unissex: 0, indefinido: 0 }, evolucao: new Map() },
    }

    // Set de order_ids por marca (pra contar pedido único)
    const orderIdsPorMarca: Record<string, Set<string>> = {
      [marcaANomeReal]: new Set(),
      [marcaBNomeReal]: new Set(),
    }

    for (const o of orders) {
      const end: any = o.endereco_entrega || {}
      const uf = (end.uf || '').toString().toUpperCase() || '—'
      const cidade = (end.cidade || '').toString().trim() || '—'
      const mesKey = o.created_at ? `${o.created_at.getFullYear()}-${String(o.created_at.getMonth() + 1).padStart(2, '0')}` : 'sem-data'

      for (const it of o.order_items) {
        const mNome = it.products?.brands?.nome
        if (!mNome) continue
        const s = stats[mNome]
        if (!s) continue

        const qty = it.quantidade || 0
        const recItem = Number(it.preco_total || 0) || (Number(it.preco_unitario || 0) * qty)
        const g = (it.products?.genero || '').toLowerCase()
        const gFator = g === 'feminino' ? 'feminino' : g === 'masculino' ? 'masculino' : g === 'unissex' ? 'unissex' : 'indefinido'

        s.itens += qty
        s.receita += recItem
        s.genero[gFator] += qty
        orderIdsPorMarca[mNome].add(o.id)

        // UF
        if (!s.ufs.has(uf)) s.ufs.set(uf, { pedidos: 0, receita: 0, unidades: 0 })
        const ufData = s.ufs.get(uf)!
        ufData.receita += recItem
        ufData.unidades += qty

        // Cidade
        const cidKey = `${uf}-${cidade}`
        if (!s.cidades.has(cidKey)) s.cidades.set(cidKey, { uf, cidade, pedidos: 0, receita: 0, unidades: 0 })
        const cidData = s.cidades.get(cidKey)!
        cidData.receita += recItem
        cidData.unidades += qty

        // Produto
        const pSku = it.products?.sku
        if (pSku) {
          if (!s.produtos.has(pSku)) s.produtos.set(pSku, { sku: pSku, nome: it.products?.nome || it.nome_produto, unidades: 0, receita: 0, preco_medio: 0 })
          const p = s.produtos.get(pSku)!
          p.unidades += qty
          p.receita += recItem
          p.preco_medio = p.receita / p.unidades
        }

        // Evolução mensal
        if (!s.evolucao.has(mesKey)) s.evolucao.set(mesKey, { mes: mesKey, pedidos: 0, receita: 0, unidades: 0 })
        const m = s.evolucao.get(mesKey)!
        m.receita += recItem
        m.unidades += qty
      }
    }

    // Pós-processo: pedidos únicos e top entries
    for (const mNome of [marcaANomeReal, marcaBNomeReal]) {
      stats[mNome].pedidos = orderIdsPorMarca[mNome].size
      stats[mNome].preco_medio = stats[mNome].itens > 0 ? stats[mNome].receita / stats[mNome].itens : 0

      // Contar orders por UF (orders únicas que tem itens dessa marca na UF)
      const ordersPorUf: Record<string, Set<string>> = {}
      for (const o of orders) {
        const end2: any = o.endereco_entrega || {}
        const uf = (end2.uf || '').toString().toUpperCase() || '—'
        for (const it of o.order_items) {
          if (it.products?.brands?.nome === mNome) {
            if (!ordersPorUf[uf]) ordersPorUf[uf] = new Set()
            ordersPorUf[uf].add(o.id)
          }
        }
      }
      for (const [uf, ids] of Object.entries(ordersPorUf)) {
        const u = stats[mNome].ufs.get(uf)
        if (u) u.pedidos = ids.size
      }

      const ordersPorCidade: Record<string, Set<string>> = {}
      for (const o of orders) {
        const end3: any = o.endereco_entrega || {}
        const uf = (end3.uf || '').toString().toUpperCase() || '—'
        const cidade = (end3.cidade || '').toString().trim() || '—'
        for (const it of o.order_items) {
          if (it.products?.brands?.nome === mNome) {
            const k = `${uf}-${cidade}`
            if (!ordersPorCidade[k]) ordersPorCidade[k] = new Set()
            ordersPorCidade[k].add(o.id)
          }
        }
      }
      for (const [k, ids] of Object.entries(ordersPorCidade)) {
        const c = stats[mNome].cidades.get(k)
        if (c) c.pedidos = ids.size
      }

      const ordersPorMes: Record<string, Set<string>> = {}
      for (const o of orders) {
        const mesKey = o.created_at ? `${o.created_at.getFullYear()}-${String(o.created_at.getMonth() + 1).padStart(2, '0')}` : 'sem-data'
        for (const it of o.order_items) {
          if (it.products?.brands?.nome === mNome) {
            if (!ordersPorMes[mesKey]) ordersPorMes[mesKey] = new Set()
            ordersPorMes[mesKey].add(o.id)
          }
        }
      }
      for (const [k, ids] of Object.entries(ordersPorMes)) {
        const m = stats[mNome].evolucao.get(k)
        if (m) m.pedidos = ids.size
      }
    }

    // ===== Função de saída por marca =====
    const buildSummary = (mNome: string) => {
      const s = stats[mNome]
      const tg = s.genero.feminino + s.genero.masculino + s.genero.unissex + s.genero.indefinido
      const topUfEntry = Array.from(s.ufs.entries()).sort((a, b) => b[1].receita - a[1].receita)[0]
      const concentracao = topUfEntry ? (topUfEntry[1].receita / Math.max(s.receita, 1)) * 100 : 0

      return {
        nome: mNome,
        pedidos: s.pedidos,
        itens: s.itens,
        receita: Number(s.receita.toFixed(2)),
        preco_medio: Number(s.preco_medio.toFixed(2)),
        ticket_medio: s.pedidos > 0 ? Number((s.receita / s.pedidos).toFixed(2)) : 0,
        pct_feminino: tg > 0 ? Number(((s.genero.feminino / tg) * 100).toFixed(1)) : 0,
        pct_masculino: tg > 0 ? Number(((s.genero.masculino / tg) * 100).toFixed(1)) : 0,
        pct_unissex: tg > 0 ? Number(((s.genero.unissex / tg) * 100).toFixed(1)) : 0,
        concentracao_uf: Number(concentracao.toFixed(1)),
        uf_principal: topUfEntry ? topUfEntry[0] : null,
        top_ufs: Array.from(s.ufs.entries()).sort((a, b) => b[1].receita - a[1].receita).slice(0, 10).map(([uf, d]) => ({ uf, pedidos: d.pedidos, receita: Number(d.receita.toFixed(2)), unidades: d.unidades, pct: Number(((d.receita / Math.max(s.receita, 1)) * 100).toFixed(1)) })),
        top_cidades: Array.from(s.cidades.values()).sort((a, b) => b.receita - a.receita).slice(0, 10).map((c) => ({ cidade: c.cidade, uf: c.uf, pedidos: c.pedidos, receita: Number(c.receita.toFixed(2)), unidades: c.unidades })),
        top_produtos: Array.from(s.produtos.values()).sort((a, b) => b.receita - a.receita).slice(0, 10).map((p) => ({ sku: p.sku, nome: p.nome, unidades: p.unidades, receita: Number(p.receita.toFixed(2)), preco_medio: Number(p.preco_medio.toFixed(2)) })),
        evolucao: Array.from(s.evolucao.values()).sort((a, b) => a.mes.localeCompare(b.mes)).map((m) => ({ mes: m.mes, pedidos: m.pedidos, receita: Number(m.receita.toFixed(2)), unidades: m.unidades })),
      }
    }

    const sumA = buildSummary(marcaANomeReal)
    const sumB = buildSummary(marcaBNomeReal)

    // ===== Insights / Comparações =====
    // Onde A ganha, onde B ganha, onde empatam
    const comparativoUfs: { uf: string; receita_a: number; receita_b: number; vencedor: 'A' | 'B' | 'empate'; diff_pct: number }[] = []
    const allUfs = new Set([...sumA.top_ufs.map((u) => u.uf), ...sumB.top_ufs.map((u) => u.uf)])
    for (const uf of allUfs) {
      const recA = stats[marcaANomeReal].ufs.get(uf)?.receita || 0
      const recB = stats[marcaBNomeReal].ufs.get(uf)?.receita || 0
      const max = Math.max(recA, recB)
      const min = Math.min(recA, recB)
      const diffPct = max > 0 ? ((max - min) / max) * 100 : 0
      const vencedor = recA > recB * 1.2 ? 'A' : recB > recA * 1.2 ? 'B' : 'empate'
      comparativoUfs.push({ uf, receita_a: Number(recA.toFixed(2)), receita_b: Number(recB.toFixed(2)), vencedor, diff_pct: Number(diffPct.toFixed(1)) })
    }
    comparativoUfs.sort((a, b) => Math.max(b.receita_a, b.receita_b) - Math.max(a.receita_a, a.receita_a))

    const ufs_onde_a_ganha = comparativoUfs.filter((c) => c.vencedor === 'A').slice(0, 5)
    const ufs_onde_b_ganha = comparativoUfs.filter((c) => c.vencedor === 'B').slice(0, 5)
    const ufs_empatadas = comparativoUfs.filter((c) => c.vencedor === 'empate').slice(0, 5)

    const insights: { emoji: string; tipo: 'positivo' | 'atencao' | 'info'; titulo: string; detalhe: string; marca?: 'A' | 'B' }[] = []

    // Diferença de receita
    if (sumA.receita > 0 && sumB.receita > 0) {
      const ratio = sumA.receita / sumB.receita
      if (ratio > 1.5) {
        insights.push({ emoji: '🏆', tipo: 'positivo', titulo: `${marcaANomeReal} vende ${ratio.toFixed(1)}x mais que ${marcaBNomeReal}`, detalhe: `${sumA.receita.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} vs ${sumB.receita.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} no período`, marca: 'A' })
      } else if (ratio < 0.67) {
        insights.push({ emoji: '🏆', tipo: 'positivo', titulo: `${marcaBNomeReal} vende ${(1 / ratio).toFixed(1)}x mais que ${marcaANomeReal}`, detalhe: `${sumB.receita.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} vs ${sumA.receita.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} no período`, marca: 'B' })
      }
    }

    // Ticket médio
    if (sumA.ticket_medio > 0 && sumB.ticket_medio > 0) {
      const ratio = sumA.ticket_medio / sumB.ticket_medio
      if (ratio > 1.2) {
        insights.push({ emoji: '💎', tipo: 'positivo', titulo: `${marcaANomeReal} tem ticket médio ${ratio.toFixed(1)}x maior`, detalhe: `R$ ${sumA.ticket_medio.toFixed(2)} vs R$ ${sumB.ticket_medio.toFixed(2)} por pedido. Público premium.`, marca: 'A' })
      } else if (ratio < 0.83) {
        insights.push({ emoji: '💎', tipo: 'positivo', titulo: `${marcaBNomeReal} tem ticket médio ${(1 / ratio).toFixed(1)}x maior`, detalhe: `R$ ${sumB.ticket_medio.toFixed(2)} vs R$ ${sumA.ticket_medio.toFixed(2)} por pedido.`, marca: 'B' })
      }
    }

    // Gênero
    if (Math.abs(sumA.pct_feminino - sumB.pct_feminino) > 15) {
      const maisFeminina = sumA.pct_feminino > sumB.pct_feminino ? marcaANomeReal : marcaBNomeReal
      const pct = Math.max(sumA.pct_feminino, sumB.pct_feminino)
      insights.push({ emoji: '👩', tipo: 'info', titulo: `${maisFeminina} é mais feminina (${pct.toFixed(0)}%)`, detalhe: `Público-alvo bem definido. ${maisFeminina === marcaANomeReal ? marcaBNomeReal : marcaANomeReal} tem perfil mais diverso.`, marca: maisFeminina === marcaANomeReal ? 'A' : 'B' })
    }

    // Concentração
    if (Math.abs(sumA.concentracao_uf - sumB.concentracao_uf) > 15) {
      const maisConcentrada = sumA.concentracao_uf > sumB.concentracao_uf ? marcaANomeReal : marcaBNomeReal
      insights.push({ emoji: '🎯', tipo: 'atencao', titulo: `${maisConcentrada} é mais concentrada geograficamente`, detalhe: `${sumA.concentracao_uf > sumB.concentracao_uf ? sumA.concentracao_uf.toFixed(0) : sumB.concentracao_uf.toFixed(0)}% das vendas em ${sumA.concentracao_uf > sumB.concentracao_uf ? sumA.uf_principal : sumB.uf_principal}. Risco de sazonalidade regional.`, marca: sumA.concentracao_uf > sumB.concentracao_uf ? 'A' : 'B' })
    }

    // UF dominante
    if (sumA.uf_principal && sumA.uf_principal === sumB.uf_principal) {
      insights.push({ emoji: '🏙️', tipo: 'info', titulo: `Ambas dominam em ${sumA.uf_principal}`, detalhe: `Top estado é o mesmo. Considere cross-sell entre as marcas nesse estado.` })
    }

    // Onde A ganha mas B é fraca
    const aGanhaForte = ufs_onde_a_ganha.filter((c) => c.receita_b < 1000)
    if (aGanhaForte.length > 0) {
      insights.push({ emoji: '🌟', tipo: 'positivo', titulo: `${marcaANomeReal} domina onde ${marcaBNomeReal} é fraca`, detalhe: `Em ${aGanhaForte[0].uf}, ${marcaANomeReal} fatura ${ufs_onde_a_ganha[0].receita_a.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} e ${marcaBNomeReal} só ${ufs_onde_a_ganha[0].receita_b.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`, marca: 'A' })
    }

    return NextResponse.json({
      ok: true,
      filtros: { meses, marca_a: marcaANomeReal, marca_b: marcaBNomeReal },
      marca_a: sumA,
      marca_b: sumB,
      comparativo: {
        receita_diff_pct: sumA.receita > 0 && sumB.receita > 0 ? Number((((sumA.receita - sumB.receita) / Math.max(sumA.receita, sumB.receita)) * 100).toFixed(1)) : 0,
        ticket_diff_pct: sumA.ticket_medio > 0 && sumB.ticket_medio > 0 ? Number((((sumA.ticket_medio - sumB.ticket_medio) / Math.max(sumA.ticket_medio, sumB.ticket_medio)) * 100).toFixed(1)) : 0,
        ufs_onde_a_ganha,
        ufs_onde_b_ganha,
        ufs_empatadas,
        ufs_total: comparativoUfs.length,
      },
      insights,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message, stack: err.stack }, { status: 500 })
  }
}
