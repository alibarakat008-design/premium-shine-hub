// API: Inspeção de Vendas por Dia
// GET /api/admin/inspecao-vendas?mes=2026-01
//   → retorna: dias com vendas + lista detalhada
//
// GET /api/admin/inspecao-vendas?mes=2026-01&dia=2026-01-15
//   → retorna: orders detalhadas daquele dia

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { pickCusto } from '@/lib/custos'
import { calcularComissao } from '@/lib/comissoes'
import { verifySessionToken, getCookieName } from '@/lib/auth-parceiro'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function getCompanyIdFromCookie(req: NextRequest): string | null {
  const token = req.cookies.get(getCookieName())?.value
  if (token) {
    const session = verifySessionToken(token)
    if (session) return session.companyId
  }
  const activeCompany = req.cookies.get('psh_session_company')?.value
  if (activeCompany) return activeCompany
  return null
}

export async function GET(req: NextRequest) {
  try {
    const companyId = getCompanyIdFromCookie(req)
    if (!companyId) {
      return NextResponse.json({ ok: false, error: 'Não logado' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const mesParam = searchParams.get('mes') // YYYY-MM
    const diaParam = searchParams.get('dia') // YYYY-MM-DD

    if (!mesParam && !diaParam) {
      return NextResponse.json({ ok: false, error: 'Informe ?mes=YYYY-MM ou ?mes=YYYY-MM&dia=YYYY-MM-DD' }, { status: 400 })
    }

    // Caso 1: detalhe de um dia específico
    if (mesParam && diaParam) {
      const [y, m, d] = diaParam.split('-').map(Number)
      // USA BRT (UTC-3) — vendas são no fuso de SP
      // Dia "2026-07-05" em BRT = 2026-07-05T00:00:00-03:00 = 2026-07-05T03:00:00Z
      //                            até 2026-07-05T23:59:59-03:00 = 2026-07-06T02:59:59Z
      const start = new Date(Date.UTC(y, m - 1, d, 3, 0, 0))
      const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1)
      const orders = await prisma.orders.findMany({
        where: {
          company_id: companyId,
          created_at: { gte: start, lte: end },
        },
        orderBy: { created_at: 'asc' },
        include: {
          order_items: {
            include: {
              products: {
                select: {
                  id: true,
                  sku: true,
                  nome: true,
                  foto_principal_url: true,
                  product_prices: { select: { custo: true, canal: true, preco_venda: true } },
                  marketplace_listings: { select: { envio_full: true, listing_type: true } },
                },
              },
            },
          },
          marketplace_accounts: { select: { nickname: true, plataforma: true } },
        },
      })

      let totalReceita = 0
      let totalCusto = 0
      let totalRecebimento = 0
      let totalItens = 0
      const ordersFmt = orders.map((o) => {
        const venda = Number(o.total || 0)
        const plataforma = (o.marketplace_accounts as any)?.plataforma || 'mercado_livre'

        // Custo dos itens (CMV)
        let custo = 0
        let qtdItens = 0
        const itensFmt = (o.order_items || []).map((it: any) => {
          const c = pickCusto(it.products?.product_prices, plataforma)
          custo += c * (it.quantidade || 1)
          qtdItens += it.quantidade || 1
          return {
            id: it.id,
            sku: it.products?.sku || it.sku || '—',
            nome: it.products?.nome || it.nome_produto || '—',
            foto: it.products?.foto_principal_url || null,
            quantidade: it.quantidade,
            preco_unitario: Number(it.preco_unitario),
            preco_total: Number(it.preco_total),
            custo_unitario: c,
          }
        })

        // USAR O RECEBIMENTO SALVO (já considera tarifa fixa, bonus_envio, custo_flex, bonus_cupom)
        // Fallback: venda - comissao_seller_valor (só se DB não tiver o correto)
        const recebimentoDb = o.recebimento_liquido != null ? Number(o.recebimento_liquido) : null
        const comissaoDb = o.comissao_seller_valor != null ? Number(o.comissao_seller_valor) : null

        let recebimento: number
        let comissao: number
        let taxaMedia = 0

        if (recebimentoDb != null && recebimentoDb > 0) {
          // DB tem o valor salvo (canônico) — usa ele
          recebimento = recebimentoDb
          comissao = comissaoDb != null ? comissaoDb : (venda - recebimentoDb)
          taxaMedia = venda > 0 ? (comissao / venda) : 0
        } else {
          // Fallback: calcular do zero (mas considera tarifa fixa via comissoes.ts)
          let totalComissao = 0
          let totalTaxa = 0
          let itensComTaxa = 0
          for (const it of o.order_items || []) {
            const precoItem = Number(it.preco_unitario || 0) * Number(it.quantidade || 1)
            const res = calcularComissao({
              origem: 'mercado_livre',
              valor: precoItem,
              item: { listing: it.products?.marketplace_listings?.[0] },
              comissao_salva: null,
            })
            totalComissao += res.valor
            totalTaxa += res.taxa
            itensComTaxa++
          }
          taxaMedia = itensComTaxa > 0 ? totalTaxa / itensComTaxa : 0.13
          comissao = totalComissao
          recebimento = venda - comissao
        }

        const margem = recebimento - custo
        const margemPct = recebimento > 0 ? (margem / recebimento) * 100 : 0
        totalReceita += venda
        totalCusto += custo
        totalRecebimento += recebimento
        totalItens += qtdItens
        return {
          id: o.id,
          order_number: o.order_number,
          hora: o.created_at ? new Date(o.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'America/Sao_Paulo' }) : '—',
          data_completa: o.created_at,
          status: o.status,
          conta: (o.marketplace_accounts as any)?.nickname || '—',
          venda: Number(venda.toFixed(2)),
          comissao: Number(comissao.toFixed(2)),
          taxa_comissao_pct: Number((taxaMedia * 100).toFixed(1)),
          recebimento: Number(recebimento.toFixed(2)),
          custo: Number(custo.toFixed(2)),
          margem_reais: Number(margem.toFixed(2)),
          margem_pct: Number(margemPct.toFixed(1)),
          itens: itensFmt,
        }
      })

      return NextResponse.json({
        ok: true,
        tipo: 'dia',
        dia: diaParam,
        total_orders: orders.length,
        resumo: {
          receita: Number(totalReceita.toFixed(2)),
          recebimento: Number(totalRecebimento.toFixed(2)),
          custo: Number(totalCusto.toFixed(2)),
          margem: Number((totalRecebimento - totalCusto).toFixed(2)),
          itens: totalItens,
        },
        orders: ordersFmt,
      })
    }

    // Caso 2: resumo por dia do mês
    if (mesParam) {
      const [y, m] = mesParam.split('-').map(Number)
      // USA BRT (UTC-3) pra alinhar com fuso do Brasil
      // Início do mês BRT = dia 1 00:00 BRT = dia 1 03:00 UTC
      // Fim do mês BRT = último dia 23:59 BRT = próximo mês 02:59 UTC
      const start = new Date(Date.UTC(y, m - 1, 1, 3, 0, 0))
      const end = new Date(Date.UTC(y, m, 1, 2, 59, 59))
      const orders = await prisma.orders.findMany({
        where: {
          company_id: companyId,
          created_at: { gte: start, lt: end },
        },
        select: {
          id: true,
          total: true,
          created_at: true,
          status: true,
          // USA o recebimento_liquido SALVO (canônico — já considera tarifa fixa, bonus_envio etc)
          recebimento_liquido: true,
          order_items: { select: { custo_unitario: true, quantidade: true } },
        },
      })

      type DiaMap = {
        dia: string
        vendas: number
        receita: number
        cmv: number
        margem: number
        canceladas: number
        canceladas_receita: number
      }
      const diasMap: Record<string, DiaMap> = {}
      // Preencher todos os dias do mês
      const daysInMonth = new Date(y, m, 0).getDate()
      for (let d = 1; d <= daysInMonth; d++) {
        const key = `${mesParam}-${String(d).padStart(2, '0')}`
        diasMap[key] = { dia: key, vendas: 0, receita: 0, cmv: 0, margem: 0, canceladas: 0, canceladas_receita: 0 }
      }
      for (const o of orders) {
        if (!o.created_at) continue
        // Converte UTC → BRT (subtrai 3h) pra alinhar com o fuso do Brasil
        const d = new Date(new Date(o.created_at).getTime() - 3 * 60 * 60 * 1000)
        const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
        if (!diasMap[key]) continue
        const cmv = (o.order_items || []).reduce((s, it) => s + Number(it.custo_unitario || 0) * Number(it.quantidade || 1), 0)
        // USA o recebimento_liquido SALVO (já desconta comissao + tarifa_fixa + frete, soma bonus_envio + bonus_cupom)
        // Fallback: venda - cmv só se DB não tiver
        const recebimentoDb = o.recebimento_liquido != null ? Number(o.recebimento_liquido) : Number(o.total || 0) - cmv
        if (o.status === 'cancelado') {
          diasMap[key].canceladas++
          diasMap[key].canceladas_receita += Number(o.total || 0)
        } else {
          diasMap[key].vendas++
          diasMap[key].receita += Number(o.total || 0)
          diasMap[key].cmv += cmv
          diasMap[key].margem += recebimentoDb - cmv
        }
      }
      const dias = Object.values(diasMap).map((d) => ({
        ...d,
        receita: Number(d.receita.toFixed(2)),
        cmv: Number(d.cmv.toFixed(2)),
        margem: Number(d.margem.toFixed(2)),
        canceladas_receita: Number(d.canceladas_receita.toFixed(2)),
      }))

      const totalVendas = dias.reduce((s, d) => s + d.vendas, 0)
      const totalReceita = dias.reduce((s, d) => s + d.receita, 0)
      const totalCmv = dias.reduce((s, d) => s + d.cmv, 0)
      const totalMargem = dias.reduce((s, d) => s + d.margem, 0)
      const totalCanceladas = dias.reduce((s, d) => s + d.canceladas, 0)
      const diasComVenda = dias.filter((d) => d.vendas > 0).length

      return NextResponse.json({
        ok: true,
        tipo: 'mes',
        mes: mesParam,
        dias,
        resumo: {
          total_vendas: totalVendas,
          total_receita: Number(totalReceita.toFixed(2)),
          total_cmv: Number(totalCmv.toFixed(2)),
          total_margem: Number(totalMargem.toFixed(2)),
          total_canceladas: totalCanceladas,
          dias_com_venda: diasComVenda,
          dias_no_mes: daysInMonth,
          media_diaria: diasComVenda > 0 ? Number((totalVendas / diasComVenda).toFixed(1)) : 0,
        },
      })
    }
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message, stack: err.stack }, { status: 500 })
  }
}
