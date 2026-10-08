// GET /api/admin/relatorios/geografico-extra
// Análise geográfica completa:
// - Top UFs e cidades
// - Top marcas por UF (e top UFs por marca)
// - Distribuição de gênero (feminino/masculino/unissex) por UF
// - Top cidades por marca
// - Onde o público feminino é maior (% de pedidos femininos por UF)
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
    products: {
      genero: string | null
      brands: { id: string; nome: string } | null
    } | null
  }[]
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const meses = Math.min(Number(searchParams.get('meses') || 6), 24)
    const marcaId = searchParams.get('marca_id') // opcional
    const genero = searchParams.get('genero') // 'feminino' | 'masculino' | 'unissex'

    const dataInicio = new Date()
    dataInicio.setMonth(dataInicio.getMonth() - meses)

    // Filtro: só orders com endereço
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
            products: {
              select: {
                genero: true,
                brands: { select: { id: true, nome: true } },
              },
            },
          },
        },
      },
    })

    // Helpers
    const getUf = (o: OrderRow) => (o.endereco_entrega?.uf || '').toString().toUpperCase()
    const getCidade = (o: OrderRow) => (o.endereco_entrega?.cidade || '').toString().trim()

    // Mapa de agregação
    interface UfAgg {
      uf: string
      pedidos: number
      receita: number
      cidades: Set<string>
      unidades: number
      genero: { feminino: number; masculino: number; unissex: number; indefinido: number }
      marcas: Map<string, { marca: string; pedidos: number; receita: number; unidades: number }>
    }
    const ufMap = new Map<string, UfAgg>()
    interface CidadeAgg {
      uf: string
      cidade: string
      pedidos: number
      receita: number
      unidades: number
      genero: { feminino: number; masculino: number; unissex: number; indefinido: number }
    }
    const cidadeMap = new Map<string, CidadeAgg>()
    const marcaGlobal = new Map<string, { marca: string; pedidos: number; receita: number; unidades: number; ufs: Map<string, number> }>()

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
    const getOrCreateMarcaGlobal = (id: string, nome: string) => {
      if (!marcaGlobal.has(id)) {
        marcaGlobal.set(id, { marca: nome, pedidos: 0, receita: 0, unidades: 0, ufs: new Map() })
      }
      return marcaGlobal.get(id)!
    }

    let pedidosFiltrados = 0
    let receitaFiltrada = 0

    for (const o of orders) {
      const uf = getUf(o)
      const cidade = getCidade(o)
      if (!uf) continue

      const total = Number(o.total || 0)

      // Filtrar por marca/gênero (se informado)
      let passou = true
      const itensFiltrados: typeof o.order_items = []
      for (const it of o.order_items) {
        if (marcaId && it.products?.brands?.id !== marcaId) continue
        if (genero && (it.products?.genero || '').toLowerCase() !== genero.toLowerCase()) continue
        itensFiltrados.push(it)
      }
      if ((marcaId || genero) && itensFiltrados.length === 0) passou = false
      if (!passou) continue

      pedidosFiltrados++
      receitaFiltrada += total

      // UF
      const u = getOrCreateUf(uf)
      u.pedidos++
      u.receita += total
      u.cidades.add(cidade || '—')
      const unidades = itensFiltrados.reduce((s, i) => s + (i.quantidade || 0), 0)
      u.unidades += unidades

      // Cidade
      const c = getOrCreateCidade(uf, cidade || '—')
      c.pedidos++
      c.receita += total
      c.unidades += unidades

      // Genero e Marcas por order_item
      for (const it of itensFiltrados) {
        const g = (it.products?.genero || '').toLowerCase()
        if (g === 'feminino') { u.genero.feminino += it.quantidade; c.genero.feminino += it.quantidade }
        else if (g === 'masculino') { u.genero.masculino += it.quantidade; c.genero.masculino += it.quantidade }
        else if (g === 'unissex') { u.genero.unissex += it.quantidade; c.genero.unissex += it.quantidade }
        else { u.genero.indefinido += it.quantidade; c.genero.indefinido += it.quantidade }

        const marcaId = it.products?.brands?.id
        const marcaNome = it.products?.brands?.nome || 'Sem marca'
        if (marcaId) {
          if (!u.marcas.has(marcaId)) {
            u.marcas.set(marcaId, { marca: marcaNome, pedidos: 0, receita: 0, unidades: 0 })
          }
          const m = u.marcas.get(marcaId)!
          m.pedidos += it.quantidade
          m.receita += Number(it.quantidade) * (Number(o.total) / Math.max(o.order_items.reduce((s, i) => s + i.quantidade, 0), 1))
          m.unidades += it.quantidade

          const mg = getOrCreateMarcaGlobal(marcaId, marcaNome)
          mg.pedidos += it.quantidade
          mg.unidades += it.quantidade
          mg.receita += Number(it.quantidade) * (Number(o.total) / Math.max(o.order_items.reduce((s, i) => s + i.quantidade, 0), 1))
          mg.ufs.set(uf, (mg.ufs.get(uf) || 0) + it.quantidade)
        }
      }
    }

    // Top UFs (com % feminino, top marcas)
    const topUfs = Array.from(ufMap.values())
      .sort((a, b) => b.receita - a.receita)
      .slice(0, 27)
      .map((u) => {
        const totalGenero = u.genero.feminino + u.genero.masculino + u.genero.unissex + u.genero.indefinido
        const pctFeminino = totalGenero > 0 ? (u.genero.feminino / totalGenero) * 100 : 0
        const topMarcas = Array.from(u.marcas.values())
          .sort((a, b) => b.receita - a.receita)
          .slice(0, 5)
        return {
          uf: u.uf,
          pedidos: u.pedidos,
          receita: u.receita,
          unidades: u.unidades,
          cidades: u.cidades.size,
          pct_feminino: Number(pctFeminino.toFixed(1)),
          pct_masculino: Number(((u.genero.masculino / Math.max(totalGenero, 1)) * 100).toFixed(1)),
          pct_unissex: Number(((u.genero.unissex / Math.max(totalGenero, 1)) * 100).toFixed(1)),
          top_marcas: topMarcas.map((m) => ({ marca: m.marca, pedidos: m.pedidos, receita: Number(m.receita.toFixed(2)) })),
        }
      })

    // Top Cidades
    const topCidades = Array.from(cidadeMap.values())
      .sort((a, b) => b.receita - a.receita)
      .slice(0, 50)
      .map((c) => {
        const totalGenero = c.genero.feminino + c.genero.masculino + c.genero.unissex + c.genero.indefinido
        return {
          uf: c.uf,
          cidade: c.cidade,
          pedidos: c.pedidos,
          receita: Number(c.receita.toFixed(2)),
          unidades: c.unidades,
          pct_feminino: Number(((c.genero.feminino / Math.max(totalGenero, 1)) * 100).toFixed(1)),
        }
      })

    // Top Marcas Global (com top UFs)
    const topMarcas = Array.from(marcaGlobal.values())
      .sort((a, b) => b.receita - a.receita)
      .slice(0, 30)
      .map((m) => {
        const topUfsMarca = Array.from(m.ufs.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([uf, qty]) => ({ uf, pedidos: qty, pct: Number(((qty / Math.max(m.pedidos, 1)) * 100).toFixed(1)) }))
        return {
          marca: m.marca,
          pedidos: m.pedidos,
          receita: Number(m.receita.toFixed(2)),
          unidades: m.unidades,
          top_ufs: topUfsMarca,
        }
      })

    // Top UFs por % feminino (ranking de público feminino)
    const topUfsFeminino = [...topUfs]
      .filter((u) => u.pedidos >= 5) // mínimo 5 pedidos pra não dar viés
      .sort((a, b) => b.pct_feminino - a.pct_feminino)
      .slice(0, 10)

    // Cross tabela Marca × UF (top 10 marcas × top 10 UFs)
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

    return NextResponse.json({
      ok: true,
      filtros: { meses, marca_id: marcaId, genero },
      resumo: {
        total_pedidos: pedidosFiltrados,
        total_receita: Number(receitaFiltrada.toFixed(2)),
        total_ufs: ufMap.size,
        total_cidades: cidadeMap.size,
        total_orders_no_periodo: orders.length,
        orders_sem_endereco: orders.length - pedidosFiltrados,
      },
      top_ufs: topUfs,
      top_cidades: topCidades,
      top_marcas: topMarcas,
      top_ufs_feminino: topUfsFeminino,
      cross_marca_uf: cross.slice(0, 100),
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message, stack: err.stack }, { status: 500 })
  }
}
