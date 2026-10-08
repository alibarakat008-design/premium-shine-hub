// GET /api/admin/canais
// Visão segmentada por canal de venda:
// - marketplace: B2Bs (vinculados) — ML, Shopee, Amazon
// - varejo_site: LIURAESSENCE — site B2C próprio
// - varejo_whatsapp: LIURAESSENCE — vendas via WhatsApp
// - b2b: vendas pra lojistas
// - atacado: vendas em grande quantidade

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const CANAL_CONFIG: Record<string, { nome: string; emoji: string; cor: string; descricao: string; dono: 'LIURAESSENCE' | 'B2B' }> = {
  mercado_livre: { nome: 'Mercado Livre', emoji: '🛒', cor: '#ffe600', descricao: 'Vendas no marketplace', dono: 'B2B' },
  shopee: { nome: 'Shopee', emoji: '🧡', cor: '#ee4d2d', descricao: 'Vendas no marketplace Shopee', dono: 'B2B' },
  amazon: { nome: 'Amazon', emoji: '📦', cor: '#ff9900', descricao: 'Vendas no marketplace Amazon', dono: 'B2B' },
  site_b2c: { nome: 'Site Próprio (varejo)', emoji: '🌐', cor: '#a78bfa', descricao: 'Vendas diretas do site', dono: 'LIURAESSENCE' },
  whatsapp: { nome: 'WhatsApp (varejo)', emoji: '💬', cor: '#22c55e', descricao: 'Vendas diretas via atendimento', dono: 'LIURAESSENCE' },
  b2b: { nome: 'Atacado / B2B', emoji: '📋', cor: '#60a5fa', descricao: 'Vendas pra lojistas', dono: 'LIURAESSENCE' },
  vendedora: { nome: 'Vendedoras', emoji: '👩‍💼', cor: '#f472b6', descricao: 'Vendas internas', dono: 'LIURAESSENCE' },
  outros: { nome: 'Outros', emoji: '🔹', cor: '#6b7280', descricao: 'Outros canais', dono: 'LIURAESSENCE' },
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const meses = Math.min(Number(searchParams.get('meses') || 6), 12)
    const dataInicio = new Date()
    dataInicio.setMonth(dataInicio.getMonth() - meses)

    // Busca todas orders
    const orders = await prisma.orders.findMany({
      where: {
        created_at: { gte: dataInicio },
        status: { not: 'cancelado' },
      },
      select: {
        id: true,
        total: true,
        origem: true,
        created_at: true,
        customer_id: true,
        order_items: {
          select: {
            quantidade: true,
            products: {
              select: {
                marketplace_listings: { take: 1, select: { envio_full: true, listing_type: true } },
              },
            },
          },
        },
        marketplace_accounts: { select: { id: true, nickname: true } },
      },
    })

    // Agrupa por origem
    type CanalAgg = {
      origem: string
      pedidos: number
      receita: number
      unidades: number
      clientes_unicos: Set<string>
      contas_unicas: Set<string>
      evolucao: Map<string, number> // mes → receita
    }
    const canaisMap = new Map<string, CanalAgg>()

    // Split de ML (Full vs Agência vs Clássico)
    const mlSplit = { full: { pedidos: 0, receita: 0, unidades: 0 }, agencia: { pedidos: 0, receita: 0, unidades: 0 }, classico: { pedidos: 0, receita: 0, unidades: 0 } }

    for (const o of orders) {
      const origem = o.origem || 'outros'
      if (!canaisMap.has(origem)) {
        canaisMap.set(origem, {
          origem,
          pedidos: 0,
          receita: 0,
          unidades: 0,
          clientes_unicos: new Set(),
          contas_unicas: new Set(),
          evolucao: new Map(),
        })
      }
      const c = canaisMap.get(origem)!
      c.pedidos++
      c.receita += Number(o.total || 0)
      const unidades = o.order_items.reduce((s, i) => s + i.quantidade, 0)
      c.unidades += unidades
      if (o.customer_id) c.clientes_unicos.add(o.customer_id)
      if (o.marketplace_accounts?.id) c.contas_unicas.add(o.marketplace_accounts.id)
      const mes = o.created_at ? `${o.created_at.getFullYear()}-${String(o.created_at.getMonth() + 1).padStart(2, '0')}` : 'sem-data'
      c.evolucao.set(mes, (c.evolucao.get(mes) || 0) + Number(o.total || 0))

      // Detecta tipo ML
      if (origem === 'mercado_livre') {
        let tipo: 'full' | 'agencia' | 'classico' = 'classico'
        for (const it of o.order_items) {
          const lst = it.products?.marketplace_listings?.[0]
          if (lst?.envio_full) { tipo = 'full'; break }
          const lt = lst?.listing_type
          if (lt === 'gold_pro' || lt === 'gold_special') tipo = 'agencia'
        }
        mlSplit[tipo].pedidos++
        mlSplit[tipo].receita += Number(o.total || 0)
        mlSplit[tipo].unidades += unidades
      }
    }

    // Monta resposta
    const canais = Array.from(canaisMap.values()).map((c) => {
      const config = CANAL_CONFIG[c.origem] || CANAL_CONFIG.outros
      return {
        ...config,
        origem: c.origem,
        pedidos: c.pedidos,
        receita: Number(c.receita.toFixed(2)),
        unidades: c.unidades,
        clientes_unicos: c.clientes_unicos.size,
        contas_b2b: c.contas_unicas.size,
        ticket_medio: c.pedidos > 0 ? Number((c.receita / c.pedidos).toFixed(2)) : 0,
        evolucao_mensal: Array.from(c.evolucao.entries()).sort().map(([mes, receita]) => ({ mes, receita: Number(receita.toFixed(2)) })),
      }
    }).sort((a, b) => b.receita - a.receita)

    // Totais
    const totalReceita = orders.reduce((s, o) => s + Number(o.total || 0), 0)
    const totalPedidos = orders.length

    // Separa por dono
    const canaisB2B = canais.filter((c) => c.dono === 'B2B')
    const canaisVarejo = canais.filter((c) => c.dono === 'LIURAESSENCE')

    const totalReceitaB2B = canaisB2B.reduce((s, c) => s + c.receita, 0)
    const totalReceitaVarejo = canaisVarejo.reduce((s, c) => s + c.receita, 0)

    return NextResponse.json({
      ok: true,
      meses,
      total_pedidos: totalPedidos,
      total_receita: Number(totalReceita.toFixed(2)),
      resumo_por_dono: {
        b2b_marketplace: {
          receita: Number(totalReceitaB2B.toFixed(2)),
          pct: totalReceita > 0 ? Number(((totalReceitaB2B / totalReceita) * 100).toFixed(1)) : 0,
          canais: canaisB2B.length,
        },
        liura_essence_varejo: {
          receita: Number(totalReceitaVarejo.toFixed(2)),
          pct: totalReceita > 0 ? Number(((totalReceitaVarejo / totalReceita) * 100).toFixed(1)) : 0,
          canais: canaisVarejo.length,
        },
      },
      // Split do Mercado Livre (Full vs Agência vs Clássico)
      ml_split: {
        full: { pedidos: mlSplit.full.pedidos, receita: Number(mlSplit.full.receita.toFixed(2)), unidades: mlSplit.full.unidades, taxa_comissao: '17%', descricao: 'Mercadoria fica no depósito do ML' },
        agencia: { pedidos: mlSplit.agencia.pedidos, receita: Number(mlSplit.agencia.receita.toFixed(2)), unidades: mlSplit.agencia.unidades, taxa_comissao: '14%', descricao: 'Você envia, ML só intermedeia' },
        classico: { pedidos: mlSplit.classico.pedidos, receita: Number(mlSplit.classico.receita.toFixed(2)), unidades: mlSplit.classico.unidades, taxa_comissao: '13%', descricao: 'Mercado Envios normal' },
      },
      canais,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message, stack: err.stack }, { status: 500 })
  }
}
