import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * POST /api/admin/fix-custo-vendas
 *
 * Recalcula orders.custo_total (e custo_flex) baseado nos order_items.custo_unitario.
 *
 * Idempotente. Pode ser chamado várias vezes.
 *
 * IMPORTANTE: custo_total é numeric(10,2) → Prisma retorna STRING. Por isso usa
 * $queryRaw pra encontrar IDs (numeric nao compara com number no Prisma).
 *
 * Body: { company_id?, only_empty?: true, limit?: 5000, force?: true }
 *   - only_empty=true: só processa onde custo_total IS NULL OU = 0
 *   - force=true: recalcula TUDO (sobrescreve mesmo se já tem custo)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const companyId = body.company_id || null
    const onlyEmpty = body.only_empty !== false
    const force = body.force === true
    const limit = Math.min(body.limit || 5000, 50000)

    // 1) Acha IDs via SQL (numeric precisa de queryRaw)
    let whereConditions: string[] = []
    if (companyId) whereConditions.push(`o.company_id = '${companyId}'::uuid`)
    if (onlyEmpty && !force) {
      whereConditions.push(`(o.custo_total IS NULL OR o.custo_total = 0)`)
    }
    const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : ''

    const sql = `
      SELECT o.id::text as id
      FROM orders o
      ${whereClause}
      ORDER BY o.created_at DESC
      LIMIT ${limit}
    `
    const idRows: any[] = await prisma.$queryRawUnsafe(sql)
    const ids = idRows.map((r: any) => r.id)

    if (ids.length === 0) {
      return NextResponse.json({ ok: true, message: 'Nenhuma venda pra recalcular', recalculados: 0 })
    }

    // 2) Pega as vendas com items via Prisma
    const orders = await prisma.orders.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        company_id: true,
        custo_total: true,
        custo_flex: true,
        tipo_envio: true,
        order_items: {
          select: {
            quantidade: true,
            custo_unitario: true,
          },
        },
      },
    })

    let recalculados = 0
    let semCustoItems = 0
    const erros: any[] = []
    const samples: any[] = []

    for (const o of orders) {
      try {
        // Soma CMV dos items (custo_unitario é numeric também, vem como string)
        let cmv = 0
        let hasCusto = false
        for (const it of o.order_items) {
          const custo = it.custo_unitario != null ? Number(it.custo_unitario) : 0
          if (custo > 0) hasCusto = true
          cmv += custo * (it.quantidade || 1)
        }
        cmv = Number(cmv.toFixed(2))
        if (!hasCusto) semCustoItems++

        // Custo FLEX
        let custoFlex = o.custo_flex != null ? Number(o.custo_flex) : 0
        if ((o.tipo_envio === 'flex' || o.tipo_envio === 'self_service') && !custoFlex) {
          custoFlex = 13.90
        }

        // Decide se atualiza
        const oldCusto = o.custo_total != null ? Number(o.custo_total) : 0
        const shouldUpdate = force || (oldCusto !== cmv && (cmv > 0 || oldCusto === 0))

        if (shouldUpdate) {
          await prisma.orders.update({
            where: { id: o.id },
            data: {
              custo_total: cmv,
              custo_flex: custoFlex || 0,
            },
          })
          recalculados++
          if (samples.length < 5) {
            samples.push({
              order: o.id,
              old_custo: oldCusto,
              new_custo: cmv,
              items: o.order_items.length,
              tipo: o.tipo_envio,
            })
          }
        }
      } catch (e: any) {
        erros.push({ order: o.id, error: e.message })
      }
    }

    return NextResponse.json({
      ok: true,
      encontrados: orders.length,
      recalculados,
      vendas_sem_custo_cadastrado: semCustoItems,
      erros: erros.length,
      samples,
      message: `${recalculados} vendas atualizadas de ${orders.length} analisadas`,
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message, stack: e.stack }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}

export async function GET(req: NextRequest) {
  return POST(req)
}
