/**
 * API: Site Próprio - Listar produtos com flag publicado_site
 * GET /api/site/products
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const products = await prisma.products.findMany({
      where: { ativo: true },
      take: 500,
      include: {
        product_prices: { where: { canal: 'mercado_livre' }, take: 1 },
        inventory: { select: { quantidade_atual: true } },
      },
      orderBy: { nome: 'asc' },
    })

    return NextResponse.json({
      success: true,
      data: products.map(p => ({
        id: p.id,
        sku: p.sku,
        nome: p.nome,
        foto_principal_url: p.foto_principal_url,
        publicado_site: p.publicado_site || false,
        url_site: p.url_site,
        preco_venda: p.product_prices[0]?.preco_venda ? Number(p.product_prices[0].preco_venda.toString()) : null,
        estoque: p.inventory?.quantidade_atual || 0,
      })),
    })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
