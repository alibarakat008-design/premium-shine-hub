/**
 * API: Dashboard consolidado com TODOS os big numbers
 * GET /api/admin/dashboard
 *
 * Retorna:
 * - Receita total
 * - Total de vendas
 * - Ticket médio
 * - Lucro líquido
 * - Comissões
 * - CMV
 * - Margem %
 * - Clientes
 * - Top produtos
 * - Top marcas
 * - Vendas por canal
 * - Crescimento %
 */

import { NextResponse } from 'next/server'
import { pickCusto } from '@/lib/custos'
import { prisma } from '@/lib/prisma'

const COMISSOES: Record<string, number> = { mercado_livre: 12, shopee: 14, site_b2c: 4, whatsapp: 0, b2b: 5, vendedora: 10 }

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET() {
  try {
    const hoje = new Date()
    const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
    const inicioMesPassado = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1)
    const fimMesPassado = new Date(hoje.getFullYear(), hoje.getMonth(), 0, 23, 59, 59)
    const inicio30 = new Date(hoje.getTime() - 30 * 24 * 3600 * 1000)
    const inicio60 = new Date(hoje.getTime() - 60 * 24 * 3600 * 1000)

    // Orders
    const allOrders = await prisma.orders.findMany({
      where: { created_at: { gte: inicio60 } },
      select: {
        id: true,
        total: true,
        created_at: true,
        marketplace_account_id: true,
        marketplace_accounts: { select: { plataforma: true } },
        comissao_seller_valor: true,
        frete: true,
        recebimento_liquido: true,
        order_items: { select: { quantidade: true, preco_unitario: true, products: { select: { product_prices: { select: { custo: true, canal: true } } } } } },
      },
    })

    // Vendas hoje
    const ordersHoje = allOrders.filter(o => {
      const d = new Date(o.created_at!)
      return d.toDateString() === hoje.toDateString()
    })
    const receitaHoje = ordersHoje.reduce((acc, o) => acc + Number(o.total), 0)

    // Vendas mês
    const ordersMes = allOrders.filter(o => new Date(o.created_at!) >= inicioMes)
    const receitaMes = ordersMes.reduce((acc, o) => acc + Number(o.total), 0)
    const pedidosMes = ordersMes.length

    // Vendas mês passado
    const ordersMesPassado = allOrders.filter(o => o.created_at && new Date(o.created_at) >= inicioMesPassado && new Date(o.created_at) <= fimMesPassado)
    const receitaMesPassado = ordersMesPassado.reduce((acc, o) => acc + Number(o.total), 0)

    // Vendas 30 dias
    const orders30 = allOrders.filter(o => o.created_at && new Date(o.created_at) >= inicio30)
    const receita30 = orders30.reduce((acc, o) => acc + Number(o.total), 0)
    const pedidos30 = orders30.length
    const ticketMedio30 = pedidos30 > 0 ? receita30 / pedidos30 : 0

    // CMV 30 dias
    let cmv30 = 0
    for (const o of orders30) {
      for (const it of o.order_items) {
        // pickCusto respeita o canal da order
        const custo = it.products ? pickCusto(it.products.product_prices, o.marketplace_accounts?.plataforma || 'outros') : 0
        cmv30 += custo * (it.quantidade || 1)
      }
    }

    // Comissões 30 dias — prioriza valor REAL (orders com comissao_seller_valor)
    // Se não tiver valor salvo, usa 12% estimado pra ML, ou % padrão pra outros canais
    let comissoes30 = 0
    let ordersComFrete = 0
    let freteTotal = 0
    for (const o of orders30) {
      if (o.comissao_seller_valor != null) {
        comissoes30 += Number(o.comissao_seller_valor)
      } else {
        const canal = o.marketplace_accounts?.plataforma || 'outros'
        const taxa = canal === 'mercado_livre' ? 0.12 : (COMISSOES[canal] || 5) / 100
        comissoes30 += Number(o.total || 0) * taxa
      }
      if (o.frete != null) {
        freteTotal += Number(o.frete)
        ordersComFrete++
      }
    }

    // Lucro bruto = receita - CMV - comissão - frete
    // (caminho único, consistente, sem double-counting)
    const lucro30 = receita30 - cmv30 - comissoes30 - freteTotal
    const margem30 = receita30 > 0 ? (lucro30 / receita30) * 100 : 0

    // Crescimento mês
    const crescimentoReceita = receitaMesPassado > 0 ? ((receitaMes - receitaMesPassado) / receitaMesPassado) * 100 : 0

    // Clientes
    const totalClientes = await prisma.customers.count()
    const clientesMes = await prisma.customers.count({ where: { created_at: { gte: inicioMes } } })

    // Top produtos
    const topProducts: Record<string, { sku: string; nome: string; vendas: number; receita: number }> = {}
    for (const o of orders30) {
      for (const it of o.order_items) {
        // Skip - precisamos do product_id
      }
    }

    // Por canal
    const canalMap: Record<string, { receita: number; pedidos: number }> = {}
    for (const o of orders30) {
      const c = o.marketplace_accounts?.plataforma || 'outros'
      if (!canalMap[c]) canalMap[c] = { receita: 0, pedidos: 0 }
      canalMap[c].receita += Number(o.total)
      canalMap[c].pedidos++
    }
    const canais = Object.entries(canalMap).map(([canal, v]) => ({ canal, ...v })).sort((a, b) => b.receita - a.receita)

    // Custos operacionais cadastrados (últimos 30 dias)
    // Soma por tipo baseado nos monthly_costs (ano/mes) do período
    const inicio30Custos = new Date(hoje.getTime() - 30 * 24 * 3600 * 1000)
    const mesInicioCutoff = inicio30Custos.getMonth() + 1
    const anoInicioCutoff = inicio30Custos.getFullYear()
    const custosMes = await prisma.monthly_costs.findMany({
      where: {
        OR: [
          { pago_em: { gte: inicio30Custos } },
          {
            pago_em: null,
            AND: [
              { ano: { gte: anoInicioCutoff } },
              // se for mesmo ano, mes >= mesInicioCutoff
              { OR: [{ ano: { gt: anoInicioCutoff } }, { mes: { gte: mesInicioCutoff } }] },
            ],
          },
        ],
      },
      select: { valor: true, category: { select: { tipo: true } } },
    })
    let custosFixos30 = 0
    let custosVariaveis30 = 0
    let impostos30 = 0
    for (const c of custosMes) {
      const v = Number(c.valor || 0)
      const tipo = (c.category as any)?.tipo
      if (tipo === 'fixo') custosFixos30 += v
      else if (tipo === 'variavel') custosVariaveis30 += v
      else if (tipo === 'imposto') impostos30 += v
    }
    const totalCustosOp30 = custosFixos30 + custosVariaveis30 + impostos30

    // Lucro REAL (após custos operacionais) — pra 30d, considera 1 mês cheio
    // Lucro REAL: receita - CMV - comissão - frete - custos operacionais
    const lucro30Real = receita30 - cmv30 - comissoes30 - freteTotal - totalCustosOp30
    const margem30Real = receita30 > 0 ? (lucro30Real / receita30) * 100 : 0

    // Estoque
    const totalProdutos = await prisma.products.count({ where: { ativo: true } })
    const estoqueTotal = await prisma.inventory.aggregate({ _sum: { quantidade_atual: true } })
    const estoqueCritico = await prisma.inventory.count({ where: { OR: [{ quantidade_atual: 0 }, { quantidade_atual: { lte: 5 } }] } })

    // Financeiro
    const totalOrders = pedidos30
    const ticket = ticketMedio30
    const totalReceita = receita30

    return NextResponse.json({
      success: true,
      data: {
        big_numbers: {
          receita_30d: totalReceita,
          receita_mes: receitaMes,
          receita_mes_passado: receitaMesPassado,
          receita_hoje: receitaHoje,
          crescimento_receita_pct: crescimentoReceita,
          pedidos_30d: totalOrders,
          pedidos_mes: pedidosMes,
          ticket_medio: ticket,
          cmv_30d: cmv30,
          comissoes_30d: comissoes30,
          lucro_30d: lucro30,
          margem_pct: margem30,
          // Custos operacionais (últimos 30d)
          custos_fixos_30d: custosFixos30,
          custos_variaveis_30d: custosVariaveis30,
          impostos_30d: impostos30,
          total_custos_op_30d: totalCustosOp30,
          // Lucro REAL (após custos operacionais)
          lucro_real_30d: lucro30Real,
          margem_real_pct: margem30Real,
        },
        clientes: {
          total: totalClientes,
          novos_mes: clientesMes,
        },
        produtos: {
          ativos: totalProdutos,
          estoque_total: estoqueTotal._sum.quantidade_atual || 0,
          estoque_critico: estoqueCritico,
        },
        canais,
      },
    })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
