// GET /api/admin/products/export-costs
// Retorna CSV com: nome, sku, custo
// Canal fixo: mercado_livre (target do FULL)

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const format = searchParams.get('format') || 'csv' // csv | json
    const canal = searchParams.get('canal') || 'mercado_livre'
    const onlyMissing = searchParams.get('missing') === 'true'

    // Buscar produtos com o preço do canal
    const products = await prisma.products.findMany({
      where: { ativo: true },
      select: {
        id: true,
        sku: true,
        nome: true,
        product_prices: { where: { canal: canal as any }, select: { custo: true, preco_venda: true }, take: 1 },
      },
      orderBy: { nome: 'asc' },
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

    let csv = '\ufeff' // BOM pra Excel abrir UTF-8 direito
    csv += 'titulo,sku,custo\n'
    for (const p of products) {
      const custo = p.product_prices?.[0]?.custo ? Number(p.product_prices[0].custo) : 0
      if (onlyMissing && custo > 0) continue
      csv += `${escapeCSV(p.nome)},${escapeCSV(p.sku)},${custo.toFixed(2)}\n`
    }

    if (format === 'json') {
      const data = products.map((p) => ({
        titulo: p.nome,
        sku: p.sku,
        custo: p.product_prices?.[0]?.custo ? Number(p.product_prices[0].custo) : 0,
      }))
      const filtered = onlyMissing ? data.filter((p) => !p.custo || p.custo === 0) : data
      return NextResponse.json({
        ok: true,
        total: filtered.length,
        data: filtered,
      })
    }

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="custos-produtos-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
