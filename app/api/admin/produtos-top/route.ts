// GET /api/admin/produtos-top?meses=6&limit=300
// Lista produtos mais vendidos pra popular selects
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const meses = Math.min(Number(searchParams.get('meses') || 6), 24)
    const limit = Math.min(Number(searchParams.get('limit') || 300), 1000)

    const dataInicio = new Date()
    dataInicio.setMonth(dataInicio.getMonth() - meses)

    const items = await prisma.order_items.groupBy({
      by: ['product_id'],
      where: { orders: { created_at: { gte: dataInicio }, status: { not: 'cancelado' } } },
      _sum: { quantidade: true, preco_total: true },
      _count: { id: true },
      orderBy: { _sum: { preco_total: 'desc' } },
      take: limit,
    })

    const products = await prisma.products.findMany({
      where: { id: { in: items.map((i) => i.product_id).filter(Boolean) as string[] } },
      select: { id: true, sku: true, nome: true, genero: true, brands: { select: { id: true, nome: true } } },
    })
    const productMap = new Map(products.map((p) => [p.id, p]))

    return NextResponse.json({
      ok: true,
      produtos: items.map((i) => {
        const p = productMap.get(i.product_id || '')
        return {
          id: i.product_id,
          sku: p?.sku || '',
          nome: p?.nome || '',
          genero: p?.genero,
          marca: p?.brands?.nome,
          unidades: i._sum.quantidade || 0,
          receita: Number(i._sum.preco_total || 0),
          pedidos: i._count.id,
        }
      }).filter((p) => p.sku),
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
