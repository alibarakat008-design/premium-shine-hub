import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * Lista produtos da mesma família (pra encontrar qual seria o custo certo)
 * GET /api/admin/debug-related?sku=ML-MLB4440524377
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const sku = searchParams.get('sku') || ''

    const p = await prisma.products.findUnique({
      where: { sku },
      select: {
        id: true,
        sku: true,
        nome: true,
        brands: { select: { nome: true } },
        product_prices: { select: { canal: true, custo: true, preco_venda: true } },
      },
    })

    if (!p) return NextResponse.json({ error: 'não encontrado' }, { status: 404 })

    // Encontra produtos similares (mesma marca + categoria no nome)
    const words = (p.nome || '').split(' ').filter((w) => w.length > 4).slice(0, 3)
    const similar = await prisma.products.findMany({
      where: {
        sku: { not: sku },
        nome: { contains: 'Capilar', mode: 'insensitive' },
        brands: p.brands?.nome ? { nome: p.brands.nome } : undefined,
      },
      select: {
        sku: true,
        nome: true,
        product_prices: { where: { canal: 'mercado_livre' }, select: { custo: true } },
      },
      take: 20,
    })

    return NextResponse.json({
      success: true,
      produto: p,
      produtos_similares: similar.map((s) => ({
        sku: s.sku,
        nome: s.nome,
        custo_ml: s.product_prices[0]?.custo ? Number(s.product_prices[0].custo) : null,
      })),
    })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
