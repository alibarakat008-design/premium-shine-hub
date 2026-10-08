// API: Painel FULL
// 3 áreas: Vendas | Estoque | Reposição
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const days = Number(searchParams.get('days') || 30)

    const from = new Date(Date.now() - days * 24 * 3600 * 1000)

    // 1) Buscar produtos em FULL (envio_full = true)
    const listingsFull = await prisma.marketplace_listings.findMany({
      where: { envio_full: true },
      include: {
        products: {
          include: {
            product_prices: { where: { canal: 'mercado_livre' }, take: 1 },
            inventory: { select: { quantidade_atual: true, quantidade_minima: true } },
          },
        },
      },
    })

    // Mapa de product_id -> listing FULL
    const productFullMap: Record<string, any> = {}
    for (const l of listingsFull) {
      if (l.product_id) productFullMap[l.product_id] = l
    }

    // 2) Vendas FULL no período
    // FULL = order tem item com product que tem listing envio_full = true
    const ordersFull = await prisma.orders.findMany({
      where: {
        created_at: { gte: from },
        status: { notIn: ['cancelado', 'devolvido'] },
        order_items: {
          some: {
            products: {
              marketplace_listings: { some: { envio_full: true } },
            },
          },
        },
      },
      include: {
        order_items: {
          where: {
            products: { marketplace_listings: { some: { envio_full: true } } },
          },
          include: {
            products: {
              select: {
                id: true,
                sku: true,
                nome: true,
                foto_principal_url: true,
                product_prices: { where: { canal: 'mercado_livre' }, select: { custo: true, preco_venda: true }, take: 1 },
                inventory: { select: { quantidade_atual: true, quantidade_minima: true } },
              },
            },
          },
        },
        marketplace_accounts: { select: { nickname: true } },
      },
      orderBy: { created_at: 'desc' },
    })

    // 3) Processar vendas FULL
    let totalVendas = 0
    let totalReceita = 0
    let totalItens = 0
    const vendasFmt: any[] = []
    const vendasPorProduto: Record<string, { id: string; sku: string; nome: string; foto: string | null; qtd: number; receita: number; custo: number; lucro: number; margem_pct: number }> = {}
    const vendasPorDia: Record<string, number> = {}
    const vendasPorHora: Record<string, number> = {}

    for (const o of ordersFull) {
      const total = Number(o.total || 0)
      const subtotal = Number(o.subtotal || total)
      const taxa = 0.14 // FULL = 14%
      const comissao = subtotal * taxa
      const recebimento = total - comissao
      let custo = 0
      let qtd = 0
      const itens: any[] = []

      for (const it of o.order_items || []) {
        const c = it.products?.product_prices?.[0]?.custo ? Number(it.products.product_prices[0].custo.toString()) : 0
        custo += c * (it.quantidade || 1)
        qtd += it.quantidade || 1
        itens.push({
          id: it.id,
          sku: it.products?.sku || '',
          nome: it.products?.nome || '',
          foto: it.products?.foto_principal_url || null,
          quantidade: it.quantidade,
          preco_total: Number(it.preco_total),
        })
        // Por produto
        if (it.products?.id) {
          if (!vendasPorProduto[it.products.id]) {
            vendasPorProduto[it.products.id] = {
              id: it.products.id,
              sku: it.products.sku,
              nome: it.products.nome,
              foto: it.products.foto_principal_url,
              qtd: 0,
              receita: 0,
              custo: 0,
              lucro: 0,
              margem_pct: 0,
            }
          }
          const p = vendasPorProduto[it.products.id]
          p.qtd += it.quantidade || 1
          p.receita += Number(it.preco_total)
          p.custo += c * (it.quantidade || 1)
        }
      }
      const margem = recebimento - custo
      const margemPct = recebimento > 0 ? (margem / recebimento) * 100 : 0
      totalVendas++
      totalReceita += total
      totalItens += qtd

      if (o.created_at) {
        const d = new Date(o.created_at)
        const diaKey = d.toISOString().slice(0, 10)
        const horaKey = String(d.getHours()).padStart(2, '0')
        vendasPorDia[diaKey] = (vendasPorDia[diaKey] || 0) + 1
        vendasPorHora[horaKey] = (vendasPorHora[horaKey] || 0) + 1
      }

      vendasFmt.push({
        id: o.id,
        order_number: o.order_number,
        data: o.created_at,
        hora: o.created_at ? new Date(o.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—',
        status: o.status,
        conta: (o.marketplace_accounts as any)?.nickname || '—',
        venda: total,
        comissao,
        recebimento,
        custo,
        margem_reais: margem,
        margem_pct: margemPct,
        itens,
        qtd_itens: qtd,
      })
    }

    // Calcular lucro por produto
    for (const p of Object.values(vendasPorProduto)) {
      p.lucro = p.receita - p.custo
      p.margem_pct = p.receita > 0 ? (p.lucro / p.receita) * 100 : 0
    }

    // 4) Estoque FULL
    const estoque: any[] = []
    for (const l of listingsFull) {
      if (!l.products) continue
      const inv = l.products.inventory
      const price = l.products.product_prices?.[0]
      const custo = price?.custo ? Number(price.custo) : 0
      const preco = price?.preco_venda ? Number(price.preco_venda) : 0
      const stockMl = l.stock_disponivel_ml || 0
      const stockLocal = inv?.quantidade_atual || 0
      const minimo = inv?.quantidade_minima || 15

      // Vendas no período pra esse produto
      const vendas = vendasPorProduto[l.products.id] || { qtd: 0 }
      const mediaDia = vendas.qtd / days
      const cobertura = mediaDia > 0 ? stockMl / mediaDia : 999

      // Reposição sugerida
      const idealDias = 30 // 30 dias de cobertura
      const estoqueIdeal = Math.ceil(mediaDia * idealDias)
      const precisaRepor = Math.max(0, estoqueIdeal - stockMl)
      const urgencia =
        cobertura < 7 ? 'critica' :
        cobertura < 15 ? 'alta' :
        cobertura < 30 ? 'media' : 'baixa'

      estoque.push({
        product_id: l.products.id,
        sku: l.products.sku,
        nome: l.products.nome,
        foto: l.products.foto_principal_url,
        preco_venda: preco,
        custo,
        stock_ml: stockMl,
        stock_local: stockLocal,
        minimo,
        vendas_periodo: vendas.qtd,
        media_dia: Number(mediaDia.toFixed(2)),
        cobertura_dias: Number(cobertura.toFixed(1)),
        estoque_ideal_30d: estoqueIdeal,
        repor: precisaRepor,
        urgencia,
        permalink: l.permalink,
      })
    }

    // Ordenar por urgência
    const ordemUrg: Record<string, number> = { critica: 0, alta: 1, media: 2, baixa: 3 }
    estoque.sort((a, b) => ordemUrg[a.urgencia] - ordemUrg[b.urgencia])

    // 5) Resumo
    const resumo = {
      total_pedidos: totalVendas,
      total_receita: Number(totalReceita.toFixed(2)),
      total_itens: totalItens,
      ticket_medio: totalVendas > 0 ? totalReceita / totalVendas : 0,
      produtos_em_full: listingsFull.length,
      produtos_criticos: estoque.filter((e) => e.urgencia === 'critica').length,
      produtos_atencao: estoque.filter((e) => e.urgencia === 'alta' || e.urgencia === 'media').length,
      valor_total_estoque: estoque.reduce((s, e) => s + e.stock_ml * e.custo, 0),
    }

    return NextResponse.json({
      ok: true,
      periodo: { dias: days, from: from.toISOString() },
      resumo,
      vendas: vendasFmt.slice(0, 200), // limite de 200 vendas mais recentes
      vendas_por_produto: Object.values(vendasPorProduto).sort((a: any, b: any) => b.qtd - a.qtd).slice(0, 50),
      vendas_por_dia: Object.entries(vendasPorDia).map(([dia, qtd]) => ({ dia, qtd })).sort((a, b) => a.dia.localeCompare(b.dia)),
      vendas_por_hora: Object.entries(vendasPorHora).map(([hora, qtd]) => ({ hora, qtd })).sort((a, b) => a.hora.localeCompare(b.hora)),
      estoque,
    })
  } catch (err: any) {
    console.error('[API FULL]', err)
    return NextResponse.json({ ok: false, error: err.message, stack: err.stack }, { status: 500 })
  }
}
