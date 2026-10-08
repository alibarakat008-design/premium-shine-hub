// GET /api/admin/orders/export?from=YYYY-MM-DD&to=YYYY-MM-DD&status=...
// Retorna CSV com todas as vendas do período (com item + custo + comissão + margem)

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const fromParam = searchParams.get('from') || new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10)
    const toParam = searchParams.get('to') || new Date().toISOString().slice(0, 10)
    const status = searchParams.get('status') // 'pago' | 'cancelado' | null (todos)
    const canal = searchParams.get('canal') // 'mercado_livre' | null

    const from = new Date(`${fromParam}T00:00:00.000Z`)
    const to = new Date(`${toParam}T23:59:59.999Z`)

    const where: any = {
      created_at: { gte: from, lte: to },
    }
    if (status === 'pago') where.status = { notIn: ['cancelado', 'devolvido'] }
    else if (status === 'cancelado') where.status = { in: ['cancelado', 'devolvido'] }
    if (canal) where.origem = canal

    const orders = await prisma.orders.findMany({
      where,
      orderBy: { created_at: 'desc' },
      include: {
        order_items: {
          include: {
            products: {
              select: {
                sku: true,
                nome: true,
                product_prices: { where: { canal: 'mercado_livre' }, select: { custo: true }, take: 1 },
              },
            },
          },
        },
        marketplace_accounts: { select: { nickname: true, plataforma: true } },
      },
    })

    // CSV
    const escapeCSV = (s: any) => {
      if (s === null || s === undefined) return ''
      const str = String(s)
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`
      }
      return str
    }

    let csv = '\ufeff' // BOM UTF-8
    csv += 'data,hora,pedido,status,plataforma,conta,produto,sku,quantidade,preco_unitario,preco_total,custo_unitario,custo_total,comissao_pct,comissao_reais,frete,recebimento,margem_reais,margem_pct\n'

    for (const o of orders) {
      const data = o.created_at ? new Date(o.created_at).toISOString().slice(0, 10) : ''
      const hora = o.created_at ? new Date(o.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''
      const conta = (o.marketplace_accounts as any)?.nickname || ''
      const plataforma = (o.marketplace_accounts as any)?.plataforma || ''
      const taxaComissao = 0.14

      for (const it of o.order_items || []) {
        const precoUnit = Number(it.preco_unitario || 0)
        const precoTotal = Number(it.preco_total || 0)
        const qty = Number(it.quantidade || 1)
        const custoUnit = it.products?.product_prices?.[0]?.custo ? Number(it.products.product_prices[0].custo) : 0
        const custoTotal = custoUnit * qty
        const comissaoReais = precoTotal * taxaComissao
        const frete = 0 // Não temos salvo
        const recebimento = precoTotal - comissaoReais
        const margemReais = recebimento - custoTotal
        const margemPct = recebimento > 0 ? (margemReais / recebimento) * 100 : 0

        csv += [
          data, hora, o.order_number, o.status, plataforma, conta,
          escapeCSV(it.products?.nome || it.nome_produto || ''),
          escapeCSV(it.products?.sku || ''),
          qty, precoUnit.toFixed(2), precoTotal.toFixed(2),
          custoUnit.toFixed(2), custoTotal.toFixed(2),
          (taxaComissao * 100).toFixed(1), comissaoReais.toFixed(2),
          frete.toFixed(2), recebimento.toFixed(2),
          margemReais.toFixed(2), margemPct.toFixed(1),
        ].join(',') + '\n'
      }
    }

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="vendas-${fromParam}-a-${toParam}.csv"`,
      },
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
