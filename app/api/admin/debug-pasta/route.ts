import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * Lista produtos que contenham "Pasta" no nome (pra você revisar antes do Excel)
 * GET /api/admin/debug-pasta
 */
export async function GET() {
  try {
    const products = await prisma.products.findMany({
      where: {
        nome: { contains: 'pasta', mode: 'insensitive' },
      },
      select: {
        id: true,
        sku: true,
        nome: true,
        brands: { select: { nome: true } },
        product_prices: {
          where: { canal: 'mercado_livre' },
          select: { custo: true, preco_venda: true },
        },
      },
      orderBy: { nome: 'asc' },
    })

    const fmt = products.map((p) => {
      const ml = p.product_prices[0]
      return {
        sku: p.sku,
        nome: p.nome,
        marca: p.brands?.nome || '—',
        custo_atual: ml ? Number(ml.custo) : null,
        preco_atual: ml ? Number(ml.preco_venda) : null,
        // qual seria o custo correto baseado na regra
        custo_correto: /pasta\s+asad|pasta\s+angel/i.test(p.nome || '') ? 75 : 80,
        mudanca: ml ? Number(ml.custo) - (/pasta\s+asad|pasta\s+angel/i.test(p.nome || '') ? 75 : 80) : 0,
      }
    })

    return NextResponse.json({
      success: true,
      total: fmt.length,
      produtos: fmt,
    })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
