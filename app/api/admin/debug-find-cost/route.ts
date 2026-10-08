import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * Lista produtos com custo específico (útil pra encontrar Angel, Bourbon, etc)
 * GET /api/admin/debug-find-cost?custo=165
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const custo = parseFloat(searchParams.get('custo') || '0')
    const marca = searchParams.get('marca') || ''

    const where: any = {}
    if (custo > 0) {
      where.product_prices = { some: { custo } }
    }
    if (marca) {
      where.brands = { nome: { contains: marca, mode: 'insensitive' } }
    }

    const products = await prisma.products.findMany({
      where,
      select: {
        id: true,
        sku: true,
        nome: true,
        brands: { select: { nome: true } },
        product_prices: {
          select: { canal: true, custo: true, preco_venda: true },
        },
      },
      take: 100,
      orderBy: { sku: 'asc' },
    })

    return NextResponse.json({
      success: true,
      filtro: { custo, marca },
      total: products.length,
      produtos: products,
    })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
