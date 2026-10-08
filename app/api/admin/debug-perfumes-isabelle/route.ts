import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * Lista todos os perfumes Isabelle La Belle pra revisar custos
 * GET /api/admin/debug-perfumes-isabelle
 */
export async function GET() {
  try {
    const products = await prisma.products.findMany({
      where: {
        OR: [
          { sku: { contains: 'ISABELLE-PERFUME', mode: 'insensitive' } },
          { nome: { contains: 'Isabelle La Belle', mode: 'insensitive' } },
        ],
        nome: { contains: 'perfume', mode: 'insensitive' },
        NOT: { nome: { contains: 'capilar', mode: 'insensitive' } },
      },
      select: {
        sku: true,
        nome: true,
        product_prices: { where: { canal: 'mercado_livre' }, select: { custo: true } },
      },
      orderBy: [{ sku: 'asc' }],
      take: 200,
    })

    // Agrupa por tamanho
    const ml15 = []
    const ml100 = []
    const outros = []
    for (const p of products) {
      const t = (p.sku + ' ' + p.nome).toLowerCase()
      const custo = p.product_prices[0]?.custo ? Number(p.product_prices[0].custo) : 0
      if (/15ml/.test(t)) ml15.push({ ...p, custo })
      else if (/100ml/.test(t)) ml100.push({ ...p, custo })
      else outros.push({ ...p, custo })
    }

    return NextResponse.json({
      success: true,
      total: products.length,
      perfumes_15ml: ml15,
      perfumes_100ml: ml100,
      outros_tamanhos: outros,
    })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
