// /api/admin/bulk-reassign
// POST: reassigna marca de múltiplos produtos em lote
// Body: { assignments: [{productId, newBrandId}] }
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isMatrizRequest } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  if (!isMatrizRequest(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const body = await req.json()
    const { assignments } = body

    if (!Array.isArray(assignments) || assignments.length === 0) {
      return NextResponse.json({ ok: false, error: 'assignments deve ser um array' }, { status: 400 })
    }

    const results = []
    for (const a of assignments) {
      if (!a.productId || !a.newBrandId) {
        results.push({ ok: false, productId: a.productId, error: 'productId e newBrandId são obrigatórios' })
        continue
      }
      try {
        const updated = await prisma.products.update({
          where: { id: a.productId },
          data: { marca_id: a.newBrandId, updated_at: new Date() },
          select: { id: true, nome: true, sku: true },
        })
        results.push({ ok: true, productId: a.productId, updated })
      } catch (e: any) {
        results.push({ ok: false, productId: a.productId, error: e.message })
      }
    }

    const sucessos = results.filter((r: any) => r.ok).length
    const erros = results.filter((r: any) => !r.ok).length

    return NextResponse.json({ ok: true, atualizados: sucessos, erros, results })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
