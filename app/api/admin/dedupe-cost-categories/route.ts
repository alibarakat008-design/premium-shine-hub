import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * Deduplica categorias de custo (mantém a mais antiga de cada nome+tipo)
 * Como monthly_costs tem 0 registros hoje, é seguro.
 * Roda só uma vez via GET /api/admin/dedupe-cost-categories?secret=LUXO2026
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const secret = searchParams.get('secret')
    if (secret !== 'LUXO2026') {
      return NextResponse.json({ success: false, error: 'secret inválido' }, { status: 401 })
    }

    // Lista todas agrupadas por nome+tipo
    const todas = await prisma.cost_categories.findMany({
      orderBy: { created_at: 'asc' },
      select: { id: true, nome: true, tipo: true, created_at: true },
    })

    const grupos = new Map<string, typeof todas>()
    for (const c of todas) {
      const k = `${c.tipo}|${c.nome}`
      if (!grupos.has(k)) grupos.set(k, [])
      grupos.get(k)!.push(c)
    }

    const mantidos: string[] = []
    const removidos: string[] = []
    for (const [k, arr] of grupos.entries()) {
      if (arr.length > 1) {
        // Mantém o mais antigo, remove o resto
        const [primeiro, ...resto] = arr
        mantidos.push(`${k} → ${primeiro.id}`)
        for (const r of resto) {
          removidos.push(`${k} → ${r.id}`)
        }
      } else {
        mantidos.push(`${k} → ${arr[0].id}`)
      }
    }

    if (removidos.length > 0) {
      const idsRemover = removidos.map((r) => r.split(' → ')[1])
      await prisma.cost_categories.deleteMany({
        where: { id: { in: idsRemover } },
      })
    }

    // Confirma estado final
    const finalCount = await prisma.cost_categories.count()

    return NextResponse.json({
      success: true,
      antes: todas.length,
      depois: finalCount,
      mantidos: mantidos.length,
      removidos: removidos.length,
      detalhes_removidos: removidos,
    })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
