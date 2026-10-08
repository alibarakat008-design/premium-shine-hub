// GET /api/admin/products/export
// Retorna CSV com todos os produtos e seus dados completos

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const format = searchParams.get('format') || 'csv'
    const onlyMissing = searchParams.get('missing') === 'true'

    const products = await prisma.products.findMany({
      where: { ativo: true },
      orderBy: { nome: 'asc' },
      include: {
        brands: { select: { nome: true } },
        categories: { select: { nome: true } },
        inventory: { select: { quantidade_atual: true, quantidade_minima: true, localizacao_fisica: true } },
        product_prices: {
          select: {
            canal: true,
            preco_venda: true,
            preco_promocional: true,
            custo: true,
          },
        },
        marketplace_listings: {
          select: {
            listing_id: true,
            preco_atual: true,
            preco_original: true,
            vendas_total: true,
            stock_disponivel_ml: true,
            status: true,
            envio_full: true,
            listing_type: true,
            permalink: true,
            health: true,
          },
          take: 1,
        },
      },
    })

    const escapeCSV = (s: any) => {
      if (s === null || s === undefined) return ''
      const str = String(s)
      if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`
      }
      return str
    }

    let csv = '\ufeff' // BOM UTF-8
    csv += 'sku,nome,marca,categoria,genero,volume,ean,ncm,ativo,destaque,estoque,estoque_minimo,localizacao,custo,preco_ml,preco_promocional_ml,preco_shopee,preco_site,listing_id,vendas_ml,estoque_ml,envio_full,listing_type,health,permalink\n'

    for (const p of products) {
      const inv = p.inventory
      const ml = p.product_prices?.find((pr) => pr.canal === 'mercado_livre')
      const sp = p.product_prices?.find((pr) => pr.canal === 'shopee')
      const st = p.product_prices?.find((pr) => pr.canal === 'site_b2c')
      const lst = p.marketplace_listings?.[0]

      if (onlyMissing && ml?.custo && Number(ml.custo) > 0) continue

      csv += [
        escapeCSV(p.sku),
        escapeCSV(p.nome),
        escapeCSV(p.brands?.nome || ''),
        escapeCSV(p.categories?.nome || ''),
        escapeCSV(p.genero || ''),
        escapeCSV(p.volume || ''),
        escapeCSV(p.ean || ''),
        escapeCSV(p.ncm || ''),
        p.ativo ? 'sim' : 'nao',
        p.destaque ? 'sim' : 'nao',
        inv?.quantidade_atual ?? 0,
        inv?.quantidade_minima ?? 0,
        escapeCSV(inv?.localizacao_fisica || ''),
        ml?.custo ? Number(ml.custo).toFixed(2) : '',
        ml?.preco_venda ? Number(ml.preco_venda).toFixed(2) : '',
        ml?.preco_promocional ? Number(ml.preco_promocional).toFixed(2) : '',
        sp?.preco_venda ? Number(sp.preco_venda).toFixed(2) : '',
        st?.preco_venda ? Number(st.preco_venda).toFixed(2) : '',
        escapeCSV(lst?.listing_id || ''),
        lst?.vendas_total ?? 0,
        lst?.stock_disponivel_ml ?? 0,
        lst?.envio_full ? 'sim' : 'nao',
        escapeCSV(lst?.listing_type || ''),
        lst?.health ?? '',
        escapeCSV(lst?.permalink || ''),
      ].join(',') + '\n'
    }

    if (format === 'json') {
      return NextResponse.json({
        ok: true,
        total: products.length,
        data: products.map((p) => ({
          sku: p.sku,
          nome: p.nome,
          marca: p.brands?.nome,
          categoria: p.categories?.nome,
          estoque: p.inventory?.quantidade_atual,
          custo_ml: p.product_prices?.find((pr) => pr.canal === 'mercado_livre')?.custo,
          preco_ml: p.product_prices?.find((pr) => pr.canal === 'mercado_livre')?.preco_venda,
          vendas_ml: p.marketplace_listings?.[0]?.vendas_total,
        })),
      })
    }

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="produtos-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
