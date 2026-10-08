// GET /api/b2b/relatorio?type=vendas_diarias
// Gera relatório em CSV baseado nas contas vinculadas
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/b2b-auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    const session = getSession()
    if (!session) return new NextResponse('Não autenticado', { status: 401 })

    const { searchParams } = new URL(req.url)
    const type = searchParams.get('type') || 'vendas_diarias'
    const meses = Math.min(Number(searchParams.get('meses') || 6), 12)

    const contas = await prisma.b2b_marketplace_accounts.findMany({
      where: { b2b_client_id: session.b2b_client_id },
      select: { id: true, plataforma: true, nickname: true },
    })
    if (contas.length === 0) return new NextResponse('Sem contas vinculadas', { status: 400 })

    const contaIds = contas.map((c) => c.id)
    const dataInicio = new Date()
    dataInicio.setMonth(dataInicio.getMonth() - meses)

    const orders = await prisma.orders.findMany({
      where: {
        created_at: { gte: dataInicio },
        status: { not: 'cancelado' },
        marketplace_account_id: { in: contaIds },
      },
      select: {
        id: true,
        order_number: true,
        total: true,
        frete: true,
        status: true,
        created_at: true,
        endereco_entrega: true,
        customers: { select: { nome: true, email: true, telefone: true } },
        marketplace_accounts: { select: { nickname: true, plataforma: true } },
        order_items: {
          select: {
            quantidade: true,
            preco_total: true,
            products: { select: { sku: true, nome: true, brands: { select: { nome: true } } } },
          },
        },
      },
      orderBy: { created_at: 'desc' },
    })

    let csv = ''

    if (type === 'vendas_diarias') {
      csv = 'Data,Pedido,Cliente,Email,Marketplace,Plataforma,UF,Cidade,Itens,Unidades,Status,Total\n'
      for (const o of orders) {
        const addr: any = o.endereco_entrega
        const itens = o.order_items.length
        const unidades = o.order_items.reduce((s, i) => s + i.quantidade, 0)
        csv += `${o.created_at?.toISOString().slice(0, 10) || ''},${o.order_number || ''},${escapeCsv(o.customers?.nome || '')},${escapeCsv(o.customers?.email || '')},${escapeCsv(o.marketplace_accounts?.nickname || '')},${o.marketplace_accounts?.plataforma || ''},${escapeCsv(addr?.uf || '')},${escapeCsv(addr?.cidade || '')},${itens},${unidades},${o.status || ''},${Number(o.total).toFixed(2)}\n`
      }
    } else if (type === 'top_produtos') {
      const prodsMap = new Map<string, { nome: string; marca: string; unidades: number; receita: number; pedidos: number }>()
      for (const o of orders) {
        for (const it of o.order_items) {
          if (!it.products?.sku) continue
          if (!prodsMap.has(it.products.sku)) {
            prodsMap.set(it.products.sku, { nome: it.products.nome, marca: it.products.brands?.nome || '', unidades: 0, receita: 0, pedidos: 0 })
          }
          const p = prodsMap.get(it.products.sku)!
          p.unidades += it.quantidade
          p.receita += Number(it.preco_total || 0)
          p.pedidos += 1
        }
      }
      const sorted = Array.from(prodsMap.entries()).sort((a, b) => b[1].receita - a[1].receita)
      csv = 'SKU,Produto,Marca,Pedidos,Unidades,Receita\n'
      for (const [sku, p] of sorted) {
        csv += `${sku},${escapeCsv(p.nome)},${escapeCsv(p.marca)},${p.pedidos},${p.unidades},${p.receita.toFixed(2)}\n`
      }
    } else if (type === 'vendas_marketplace') {
      const mktMap = new Map<string, { plataforma: string; nickname: string; pedidos: number; receita: number; unidades: number }>()
      for (const o of orders) {
        const key = o.marketplace_accounts?.plataforma || 'outros'
        if (!mktMap.has(key)) mktMap.set(key, { plataforma: key, nickname: o.marketplace_accounts?.nickname || '', pedidos: 0, receita: 0, unidades: 0 })
        const m = mktMap.get(key)!
        m.pedidos++
        m.receita += Number(o.total || 0)
        m.unidades += o.order_items.reduce((s, i) => s + i.quantidade, 0)
      }
      csv = 'Plataforma,Conta,Pedidos,Unidades,Receita\n'
      for (const m of mktMap.values()) {
        csv += `${m.plataforma},${escapeCsv(m.nickname)},${m.pedidos},${m.unidades},${m.receita.toFixed(2)}\n`
      }
    } else if (type === 'vendas_uf') {
      const ufMap = new Map<string, { pedidos: number; receita: number }>()
      for (const o of orders) {
        const uf = ((o.endereco_entrega as any)?.uf || '').toString().toUpperCase() || '—'
        if (!ufMap.has(uf)) ufMap.set(uf, { pedidos: 0, receita: 0 })
        const u = ufMap.get(uf)!
        u.pedidos++
        u.receita += Number(o.total || 0)
      }
      const sorted = Array.from(ufMap.entries()).sort((a, b) => b[1].receita - a[1].receita)
      csv = 'UF,Pedidos,Receita\n'
      for (const [uf, u] of sorted) csv += `${uf},${u.pedidos},${u.receita.toFixed(2)}\n`
    } else if (type === 'vendas_cliente') {
      const cMap = new Map<string, { nome: string; email: string; pedidos: number; receita: number; ultima: string }>()
      for (const o of orders) {
        const cid = o.customers?.email || o.customers?.nome || o.id
        if (!cMap.has(cid)) cMap.set(cid, { nome: o.customers?.nome || '—', email: o.customers?.email || '', pedidos: 0, receita: 0, ultima: '' })
        const c = cMap.get(cid)!
        c.pedidos++
        c.receita += Number(o.total || 0)
        if (!c.ultima || (o.created_at && new Date(o.created_at) > new Date(c.ultima))) c.ultima = o.created_at?.toISOString() || ''
      }
      const sorted = Array.from(cMap.values()).sort((a, b) => b.receita - a.receita)
      csv = 'Cliente,Email,Pedidos,Receita,Ticket Médio,Última Compra\n'
      for (const c of sorted) {
        const ticket = c.pedidos > 0 ? c.receita / c.pedidos : 0
        csv += `${escapeCsv(c.nome)},${escapeCsv(c.email)},${c.pedidos},${c.receita.toFixed(2)},${ticket.toFixed(2)},${c.ultima}\n`
      }
    } else if (type === 'resumo_financeiro') {
      const comissaoMap: any = {
        mercado_livre_classico: 0.13,
        mercado_livre_agencia: 0.14,
        mercado_livre_full: 0.17,
        shopee: 0.14,
        site_b2c: 0.04,
        b2b: 0.05,
      }
      const totalReceita = orders.reduce((s, o) => s + Number(o.total || 0), 0)
      const totalFrete = orders.reduce((s, o) => s + Number(o.frete || 0), 0)
      let totalComissao = 0
      for (const o of orders) {
        const plataforma = o.marketplace_accounts?.plataforma || ''
        // Detecta tipo ML (Full/Agência/Clássico) — fallback 14% se não der pra detectar
        let taxa = comissaoMap[plataforma] || 0.1
        if (plataforma === 'mercado_livre') {
          // Tenta detectar Full pelo listing_type (envio_full não tá acessível aqui, mas dá pra inferir)
          // Como o order_items não tá incluído, usamos fallback 14% (Agência, mais comum)
          taxa = 0.14
        }
        totalComissao += Number(o.total || 0) * taxa
      }
      const totalPedidos = orders.length
      const totalUnidades = orders.reduce((s, o) => s + o.order_items.reduce((acc, i) => acc + i.quantidade, 0), 0)

      csv = 'Métrica,Valor\n'
      csv += `Período (meses),${meses}\n`
      csv += `Total de pedidos,${totalPedidos}\n`
      csv += `Pedidos cancelados,${orders.filter((o) => o.status === 'cancelado').length}\n`
      csv += `Receita bruta,${totalReceita.toFixed(2)}\n`
      csv += `(-) Comissões ML/Shopee,${totalComissao.toFixed(2)}\n`
      csv += `(-) Frete pago,${totalFrete.toFixed(2)}\n`
      csv += `(=) Receita líquida estimada,${(totalReceita - totalComissao - totalFrete).toFixed(2)}\n`
      csv += `Unidades vendidas,${totalUnidades}\n`
      csv += `Ticket médio,${(totalPedidos > 0 ? totalReceita / totalPedidos : 0).toFixed(2)}\n`
    } else {
      return new NextResponse('Tipo de relatório desconhecido', { status: 400 })
    }

    return new NextResponse('\uFEFF' + csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${type}-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    })
  } catch (err: any) {
    return new NextResponse('Erro: ' + err.message, { status: 500 })
  }
}

function escapeCsv(s: string): string {
  if (s === null || s === undefined) return ''
  return String(s).replace(/"/g, '""')
}
