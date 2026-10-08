// GET /api/admin/marcas-disponiveis
// Lista todas as marcas com pelo menos 1 produto ou venda
// Usado pra popular os selects da página de comparativo
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    const marcas = await prisma.brands.findMany({
      where: { products: { some: {} } },
      select: {
        id: true,
        nome: true,
        _count: { select: { products: true } },
      },
      orderBy: { nome: 'asc' },
    })

    return NextResponse.json({
      ok: true,
      marcas: marcas.map((m) => ({ id: m.id, nome: m.nome, total_produtos: m._count.products })),
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
