// GET /api/admin/relatorios/geografico-v2
// Versão expandida com:
// - Top UFs (com % genero, top marcas, concentração)
// - Top Cidades (com % genero)
// - Top Cidades por % Feminino (mín 10 pedidos)
// - Top Marcas (com top 5 cidades, top 5 produtos, % por gênero, concentração)
// - Cross tabela Marca × UF
// - Insights automáticos (achados)
// - Comparativo Feminino vs Masculino por região

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface OrderRow {
  id: string
  total: any
  endereco_entrega: any
  order_items: {
    quantidade: number
    preco_unitario: any
    preco_total: any
    nome_produto: string
    products: {
      genero: string | null
      sku: string
      nome: string
      brands: { id: string; nome: string } | null
    } | null
  }[]
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const meses = Math.min(Number(searchParams.get('meses') || 6), 24)
    const genero = searchParams.get('genero') // 'feminino' | 'masculino' | 'unissex' | null
    const marcaId = searchParams.get('marca_id') // opcional

    const dataInicio = new Date()
    dataInicio.setMonth(dataInicio.getMonth() - meses)

    const where: any = {
      created_at: { gte: dataInicio },
      endereco_entrega: { not: null },
    }

    const orders: OrderRow[] = await prisma.orders.findMany({
      where,
      select: {
        id: true,
        total: true,
        endereco_entrega: true,
        order_items: {
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

    // ===== Helpers =====
    const getUf = (o: OrderRow) => (o.endereco_entrega?.uf || '').toString().toUpperCase()
    const getCidade = (o: OrderRow) => (o.endereco_entrega?.cidade || '').toString().trim()

    // ===== Agregadores =====
    interface GeneroCount { feminino: number; masculino: number; unissex: number; indefinido: number }

    interface UfAgg {
      uf: string
      pedidos: number
      receita: number
      unidades: number
      cidades: Set<string>
      genero: GeneroCount
      marcas: Map<string, { marca: string; pedidos: number; receita: number; unidades: number }>
    }
    const ufMap = new Map<string, UfAgg>()

    interface CidadeAgg {
      uf: string
      cidade: string
      pedidos: number
      receita: number
      unidades: number
      genero: GeneroCount
    }
    const cidadeMap = new Map<string, CidadeAgg>()

    interface MarcaAgg {
      id: string
      nome: string
      pedidos: number
      receita: number
      unidades: number
      genero: GeneroCount
      ufs: Map<string, { pedidos: number; receita: number; unidades: number }>
      cidades: Map<string, { uf: string; cidade: string; pedidos: number; receita: number; unidades: number }>
      produtos: Map<string, { sku: string; nome: string; unidades: number; receita: number }>
    }
    const marcaMap = new Map<string, MarcaAgg>()

    // ===== Funções =====
    const getOrCreateUf = (uf: string): UfAgg => {
      if (!ufMap.has(uf)) {
        ufMap.set(uf, {
          uf, pedidos: 0, receita: 0, unidades: 0,
          cidades: new Set(),
          genero: { feminino: 0, masculino: 0, unissex: 0, indefinido: 0 },
          marcas: new Map(),
        })
      }
      return ufMap.get(uf)!
    }
    const getOrCreateCidade = (uf: string, cidade: string): CidadeAgg => {
      const key = `${uf}-${cidade}`
      if (!cidadeMap.has(key)) {
        cidadeMap.set(key, {
          uf, cidade, pedidos: 0, receita: 0, unidades: 0,
          genero: { feminino: 0, masculino: 0, unissex: 0, indefinido: 0 },
        })
      }
      return cidadeMap.get(key)!
    }
    const getOrCreateMarca = (id: string, nome: string): MarcaAgg => {
      if (!marcaMap.has(id)) {
        marcaMap.set(id, {
          id, nome,
          pedidos: 0, receita: 0, unidades: 0,
          genero: { feminino: 0, masculino: 0, unissex: 0, indefinido: 0 },
          ufs: new Map(),
          cidades: new Map(),
          produtos: new Map(),
        })
      }
      return marcaMap.get(id)!
    }

    let totalPedidosFiltrados = 0
    let totalReceitaFiltrada = 0

    // ===== Processa orders =====
    for (const o of orders) {
      const uf = getUf(o)
      const cidade = getCidade(o)
      if (!uf) continue

      const total = Number(o.total || 0)
      const totalUnidades = o.order_items.reduce((s, i) => s + (i.quantidade || 0), 0)
      if (totalUnidades === 0) continue

      // Filtrar itens por gênero/marca
      const itensFiltrados: typeof o.order_items = []
      for (const it of o.order_items) {
        if (marcaId && it.products?.brands?.id !== marcaId) continue
        if (genero && (it.products?.genero || '').toLowerCase() !== genero.toLowerCase()) continue
        itensFiltrados.push(it)
      }
      if ((marcaId || genero) && itensFiltrados.length === 0) continue

      totalPedidosFiltrados++
      totalReceitaFiltrada += total

      // Distribui receita proporcionalmente aos itens filtrados
      const receitaPorItem = (it: typeof o.order_items[0]) => {
        return (it.quantidade / totalUnidades) * total
      }

      // === UF ===
      const u = getOrCreateUf(uf)
      u.pedidos++
      u.receita += total
      u.cidades.add(cidade || '—')

      // === Cidade ===
      const c = getOrCreateCidade(uf, cidade || '—')
      c.pedidos++
      c.receita += total

      // === Por item ===
      for (const it of itensFiltrados) {
        const qty = it.quantidade || 0
        const recItem = receitaPorItem(it)
        const g = (it.products?.genero || '').toLowerCase()
        const gFator = g === 'feminino' ? 'feminino' : g === 'masculino' ? 'masculino' : g === 'unissex' ? 'unissex' : 'indefinido'

        u.unidades += qty
        c.unidades += qty
        u.genero[gFator] += qty
        c.genero[gFator] += qty

        const mId = it.products?.brands?.id
        if (mId) {
          const mNome = it.products.brands.nome
          // UF → marca
          if (!u.marcas.has(mId)) u.marcas.set(mId, { marca: mNome, pedidos: 0, receita: 0, unidades: 0 })
          const um = u.marcas.get(mId)!
          um.pedidos += qty
          um.receita += recItem
          um.unidades += qty

          // Marca → UF
          const ma = getOrCreateMarca(mId, mNome)
          ma.pedidos += qty
          ma.receita += recItem
          ma.unidades += qty
          ma.genero[gFator] += qty
          if (!ma.ufs.has(uf)) ma.ufs.set(uf, { pedidos: 0, receita: 0, unidades: 0 })
          const muf = ma.ufs.get(uf)!
          muf.pedidos += qty
          muf.receita += recItem
          muf.unidades += qty

          // Marca → Cidade
          const cidadeKey = `${uf}-${cidade}`
          if (!ma.cidades.has(cidadeKey)) ma.cidades.set(cidadeKey, { uf, cidade, pedidos: 0, receita: 0, unidades: 0 })
          const mc = ma.cidades.get(cidadeKey)!
          mc.pedidos += qty
          mc.receita += recItem
          mc.unidades += qty

          // Marca → Produto
          const pSku = it.products?.sku
          if (pSku) {
            if (!ma.produtos.has(pSku)) ma.produtos.set(pSku, { sku: pSku, nome: it.products?.nome || it.nome_produto, unidades: 0, receita: 0 })
            const mp = ma.produtos.get(pSku)!
            mp.unidades += qty
            mp.receita += recItem
          }
        }
      }
    }

    // ===== Build Resposta =====
    const totalReceitaGeral = Array.from(ufMap.values()).reduce((s, u) => s + u.receita, 0)

    // Top UFs
    const topUfs = Array.from(ufMap.values())
      .sort((a, b) => b.receita - a.receita)
      .slice(0, 27)
      .map((u) => {
        const tg = u.genero.feminino + u.genero.masculino + u.genero.unissex + u.genero.indefinido
        return {
          uf: u.uf,
          pedidos: u.pedidos,
          receita: Number(u.receita.toFixed(2)),
          unidades: u.unidades,
          cidades: u.cidades.size,
          pct_nacional: Number(((u.receita / Math.max(totalReceitaGeral, 1)) * 100).toFixed(2)),
          pct_feminino: tg > 0 ? Number(((u.genero.feminino / tg) * 100).toFixed(1)) : 0,
          pct_masculino: tg > 0 ? Number(((u.genero.masculino / tg) * 100).toFixed(1)) : 0,
          pct_unissex: tg > 0 ? Number(((u.genero.unissex / tg) * 100).toFixed(1)) : 0,
          top_marcas: Array.from(u.marcas.values()).sort((a, b) => b.receita - a.receita).slice(0, 5).map((m) => ({ marca: m.marca, pedidos: m.pedidos, receita: Number(m.receita.toFixed(2)), pct: Number(((m.receita / Math.max(u.receita, 1)) * 100).toFixed(1)) })),
        }
      })

    // Top Cidades (geral)
    const topCidades = Array.from(cidadeMap.values())
      .sort((a, b) => b.receita - a.receita)
      .slice(0, 50)
      .map((c) => {
        const tg = c.genero.feminino + c.genero.masculino + c.genero.unissex + c.genero.indefinido
        return {
          uf: c.uf,
          cidade: c.cidade,
          pedidos: c.pedidos,
          receita: Number(c.receita.toFixed(2)),
          unidades: c.unidades,
          pct_feminino: tg > 0 ? Number(((c.genero.feminino / tg) * 100).toFixed(1)) : 0,
        }
      })

    // Top Cidades Feminino (mín 10 pedidos, com % feminino)
    const topCidadesFeminino = Array.from(cidadeMap.values())
      .filter((c) => c.pedidos >= 10)
      .map((c) => {
        const tg = c.genero.feminino + c.genero.masculino + c.genero.unissex + c.genero.indefinido
        return {
          uf: c.uf,
          cidade: c.cidade,
          pedidos: c.pedidos,
          receita: Number(c.receita.toFixed(2)),
          unidades: c.unidades,
          pct_feminino: tg > 0 ? Number(((c.genero.feminino / tg) * 100).toFixed(1)) : 0,
        }
      })
      .sort((a, b) => b.pct_feminino - a.pct_feminino)
      .slice(0, 50)

    // Top Marcas (com top cidades, top produtos, genero, concentração)
    const topMarcas = Array.from(marcaMap.values())
      .sort((a, b) => b.receita - a.receita)
      .slice(0, 30)
      .map((m) => {
        const tg = m.genero.feminino + m.genero.masculino + m.genero.unissex + m.genero.indefinido
        const topUfEntry = Array.from(m.ufs.entries()).sort((a, b) => b[1].receita - a[1].receita)[0]
        const concentracaoUf = topUfEntry ? (topUfEntry[1].receita / Math.max(m.receita, 1)) * 100 : 0
        return {
          id: m.id,
          marca: m.nome,
          pedidos: m.pedidos,
          receita: Number(m.receita.toFixed(2)),
          unidades: m.unidades,
          pct_feminino: tg > 0 ? Number(((m.genero.feminino / tg) * 100).toFixed(1)) : 0,
          pct_masculino: tg > 0 ? Number(((m.genero.masculino / tg) * 100).toFixed(1)) : 0,
          pct_unissex: tg > 0 ? Number(((m.genero.unissex / tg) * 100).toFixed(1)) : 0,
          concentracao_uf: Number(concentracaoUf.toFixed(1)),
          uf_principal: topUfEntry ? topUfEntry[0] : null,
          top_cidades: Array.from(m.cidades.values()).sort((a, b) => b.receita - a.receita).slice(0, 5).map((c) => ({ cidade: c.cidade, uf: c.uf, pedidos: c.pedidos, receita: Number(c.receita.toFixed(2)) })),
          top_produtos: Array.from(m.produtos.values()).sort((a, b) => b.unidades - a.unidades).slice(0, 5).map((p) => ({ sku: p.sku, nome: p.nome, unidades: p.unidades, receita: Number(p.receita.toFixed(2)) })),
          top_ufs: Array.from(m.ufs.entries()).sort((a, b) => b[1].receita - a[1].receita).slice(0, 5).map(([uf, agg]) => ({ uf, pedidos: agg.pedidos, receita: Number(agg.receita.toFixed(2)), pct: Number(((agg.receita / Math.max(m.receita, 1)) * 100).toFixed(1)) })),
        }
      })

    // Cross Marca × UF (top 10 x top 10)
    const top10MarcasNomes = new Set(topMarcas.slice(0, 10).map((m) => m.marca))
    const top10UfsNomes = new Set(topUfs.slice(0, 10).map((u) => u.uf))
    const cross: { marca: string; uf: string; pedidos: number; receita: number }[] = []
    for (const [uf, agg] of ufMap) {
      if (!top10UfsNomes.has(uf)) continue
      for (const m of agg.marcas.values()) {
        if (!top10MarcasNomes.has(m.marca)) continue
        cross.push({ marca: m.marca, uf, pedidos: m.pedidos, receita: Number(m.receita.toFixed(2)) })
      }
    }
    cross.sort((a, b) => b.receita - a.receita)

    // ===== INSIGHTS AUTOMÁTICOS =====
    const insights: { emoji: string; tipo: 'positivo' | 'atencao' | 'info'; titulo: string; detalhe: string }[] = []

    // 1) UF top 1
    if (topUfs.length > 0) {
      const top1 = topUfs[0]
      const nomeTop1 = { SP: 'São Paulo', RJ: 'Rio de Janeiro', MG: 'Minas Gerais', RS: 'Rio Grande do Sul', PR: 'Paraná' }[top1.uf] || top1.uf
      insights.push({
        emoji: '🏆',
        tipo: 'info',
        titulo: `${nomeTop1} é seu estado #1`,
        detalhe: `${top1.pct_nacional}% da sua receita vem de ${top1.uf} (${top1.pedidos.toLocaleString('pt-BR')} pedidos, ${top1.cidades} cidades)`,
      })
    }

    // 2) UF mais feminina (mín 30 pedidos)
    const ufsFem = topUfs.filter((u) => u.pedidos >= 30 && u.pct_feminino > 0)
    if (ufsFem.length > 0) {
      const topFem = ufsFem.sort((a, b) => b.pct_feminino - a.pct_feminino)[0]
      const nomeTop = { SP: 'São Paulo', RJ: 'Rio de Janeiro', MG: 'Minas Gerais', RS: 'Rio Grande do Sul', PR: 'Paraná', BA: 'Bahia', PE: 'Pernambuco', CE: 'Ceará', GO: 'Goiás', DF: 'Distrito Federal' }[topFem.uf] || topFem.uf
      insights.push({
        emoji: '👩',
        tipo: 'positivo',
        titulo: `${nomeTop} tem o público mais feminino`,
        detalhe: `${topFem.pct_feminino.toFixed(0)}% das vendas em ${topFem.uf} são de produtos femininos (${topFem.pedidos} pedidos)`,
      })
    }

    // 3) UF mais masculina (mín 30 pedidos)
    const ufsMasc = topUfs.filter((u) => u.pedidos >= 30 && u.pct_masculino > 0)
    if (ufsMasc.length > 0) {
      const topMasc = ufsMasc.sort((a, b) => b.pct_masculino - a.pct_masculino)[0]
      const nomeTop = { SP: 'São Paulo', RJ: 'Rio de Janeiro', MG: 'Minas Gerais', RS: 'Rio Grande do Sul', PR: 'Paraná' }[topMasc.uf] || topMasc.uf
      insights.push({
        emoji: '👨',
        tipo: 'positivo',
        titulo: `${nomeTop} tem mais público masculino`,
        detalhe: `${topMasc.pct_masculino.toFixed(0)}% das vendas em ${topMasc.uf} são de produtos masculinos (${topMasc.pedidos} pedidos)`,
      })
    }

    // 4) Marca mais feminina (mín 50 vendas)
    const marcasFem = topMarcas.filter((m) => m.pedidos >= 50 && m.pct_feminino > 0)
    if (marcasFem.length > 0) {
      const topFem = marcasFem.sort((a, b) => b.pct_feminino - a.pct_feminino)[0]
      insights.push({
        emoji: '💄',
        tipo: 'info',
        titulo: `${topFem.marca} é a marca mais feminina`,
        detalhe: `${topFem.pct_feminino.toFixed(0)}% das vendas da marca são femininas (${topFem.pedidos} vendas no período)`,
      })
    }

    // 5) Marca mais masculina
    const marcasMasc = topMarcas.filter((m) => m.pedidos >= 50 && m.pct_masculino > 0)
    if (marcasMasc.length > 0) {
      const topM = marcasMasc.sort((a, b) => b.pct_masculino - a.pct_masculino)[0]
      insights.push({
        emoji: '🪒',
        tipo: 'info',
        titulo: `${topM.marca} é a marca mais masculina`,
        detalhe: `${topM.pct_masculino.toFixed(0)}% das vendas da marca são masculinas (${topM.pedidos} vendas no período)`,
      })
    }

    // 6) Concentração de marca
    const marcasConc = topMarcas.filter((m) => m.pedidos >= 50 && m.concentracao_uf >= 50)
    if (marcasConc.length > 0) {
      const topC = marcasConc.sort((a, b) => b.concentracao_uf - a.concentracao_uf)[0]
      insights.push({
        emoji: '🎯',
        tipo: 'atencao',
        titulo: `${topC.marca} muito concentrada em ${topC.uf_principal}`,
        detalhe: `${topC.concentracao_uf.toFixed(0)}% das vendas da marca estão em ${topC.uf_principal}. Considere expandir pra outros estados.`,
      })
    }

    // 7) Cidade top
    if (topCidades.length > 0) {
      const topCid = topCidades[0]
      insights.push({
        emoji: '🏙️',
        tipo: 'positivo',
        titulo: `${topCid.cidade} é sua cidade #1`,
        detalhe: `${topCid.pedidos} pedidos e ${topCid.pct_feminino.toFixed(0)}% feminino. Vale considerar estoque local.`,
      })
    }

    // 8) UF negligenciada (com potencial)
    const ufsSudoeste = ['BA', 'PE', 'CE', 'GO', 'DF', 'MT', 'MS']
    const ufsNorte = ['AM', 'PA', 'RO', 'AC', 'RR', 'AP', 'TO', 'MA', 'PI']
    const ufsSubexploradas = topUfs.filter((u) => [...ufsSudoeste, ...ufsNorte].includes(u.uf) && u.pedidos >= 5)
    if (ufsSubexploradas.length > 0) {
      const u = ufsSubexploradas.sort((a, b) => a.pct_nacional - b.pct_nacional)[0]
      insights.push({
        emoji: '🌱',
        tipo: 'atencao',
        titulo: `${u.uf} tem potencial de crescimento`,
        detalhe: `Apenas ${u.pedidos} pedidos em ${u.uf} (${u.pct_nacional}% do total). Vale testar anúncios direcionados.`,
      })
    }

    // 9) Estado com mix balanceado (próximo de 50/50)
    const ufsMix = topUfs.filter((u) => u.pedidos >= 50)
    if (ufsMix.length > 0) {
      const u = ufsMix.sort((a, b) => Math.abs(50 - a.pct_feminino) - Math.abs(50 - b.pct_feminino))[0]
      if (Math.abs(50 - u.pct_feminino) < 10) {
        const nomeTop = { SP: 'São Paulo', RJ: 'Rio de Janeiro', MG: 'Minas Gerais', RS: 'Rio Grande do Sul', PR: 'Paraná' }[u.uf] || u.uf
        insights.push({
          emoji: '⚖️',
          tipo: 'info',
          titulo: `${nomeTop} tem o público mais equilibrado`,
          detalhe: `${u.pct_feminino.toFixed(0)}% feminino vs ${u.pct_masculino.toFixed(0)}% masculino. Mix ideal pra todo tipo de produto.`,
        })
      }
    }

    // 10) Marca em ascensão regional
    if (topMarcas.length >= 3) {
      const top1 = topMarcas[0]
      const top2 = topMarcas[1]
      if (top1.top_ufs[0] && top2.top_ufs[0] && top1.top_ufs[0].uf === top2.top_ufs[0].uf && top1.top_ufs[0].pct > 50) {
        insights.push({
          emoji: '🌟',
          tipo: 'positivo',
          titulo: `${top1.uf_principal} domina nas suas top marcas`,
          detalhe: `${top1.marca} e ${top2.marca} concentram vendas em ${top1.uf_principal}. Considere cross-sell e combos.`,
        })
      }
    }

    return NextResponse.json({
      ok: true,
      filtros: { meses, marca_id: marcaId, genero },
      resumo: {
        total_pedidos: totalPedidosFiltrados,
        total_receita: Number(totalReceitaFiltrada.toFixed(2)),
        total_ufs: ufMap.size,
        total_cidades: cidadeMap.size,
        total_marcas: marcaMap.size,
        total_orders_no_periodo: orders.length,
        orders_sem_endereco: orders.length - totalPedidosFiltrados,
      },
      top_ufs: topUfs,
      top_cidades: topCidades,
      top_cidades_feminino: topCidadesFeminino,
      top_marcas: topMarcas,
      cross_marca_uf: cross.slice(0, 100),
      insights: insights.slice(0, 10),
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message, stack: err.stack }, { status: 500 })
  }
}
