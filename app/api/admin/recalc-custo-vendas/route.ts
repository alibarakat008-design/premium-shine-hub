/**
 * Recalcula orders.custo_total, custo_flex, lucro_bruto, lucro_liquido pras vendas
 * onde estão NULL (sync antigo não preencheu).
 *
 * custo_total = sum(order_items.custo_unitario * qty)
 * custo_flex = 13.90 (se tipo_envio = self_service E custo_flex atual IS NULL)
 * lucro_bruto = recebimento_liquido - custo_total - custo_flex
 * lucro_liquido = lucro_bruto (simplificado; IR/CMC fica no DRE)
 *
 * GET  /api/admin/recalc-custo-vendas?days=120&dryRun=1
 * POST /api/admin/recalc-custo-vendas?days=120&limit=500&offset=0
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const CUSTO_FLEX_PADRAO = 13.90
const dec = (d: any) => (d ? Number(d.toString()) : 0)

async function run(dryRun: boolean, days: number, offset: number, batch: number) {
  // Recalcula TUDO das últimas N vendas ML (não só NULL) pra garantir consistência.
  // O `changed` filtra depois pra não fazer UPDATE desnecessário.
  const orders: any[] = await prisma.$queryRawUnsafe(`
    SELECT id, order_number, tipo_envio, recebimento_liquido, custo_total, custo_flex,
           lucro_bruto, lucro_liquido
    FROM orders
    WHERE origem = 'mercado_livre'
      AND created_at > NOW() - (INTERVAL '${Math.max(1, days)} days')
      AND comissao_seller_valor IS NOT NULL
      AND comissao_seller_valor > 0
    ORDER BY created_at DESC
    LIMIT ${batch} OFFSET ${offset}
  `)

  if (orders.length === 0) {
    return { total_analisadas: 0, atualizadas: 0, dry_run: dryRun, offset, sample: [] }
  }

  // 1 query agregada pra pegar custo_total de todas as vendas (evita N+1)
  const orderIds = orders.map((o) => o.id)
  const idsSql = orderIds.map((id) => `'${id}'::uuid`).join(',')
  const itemsAgg: any[] = await prisma.$queryRawUnsafe(`
    SELECT order_id,
           COALESCE(SUM(COALESCE(custo_unitario, 0) * COALESCE(quantidade, 0)), 0) AS custo_total_calc
    FROM order_items
    WHERE order_id IN (${idsSql})
    GROUP BY order_id
  `)
  const custoMap = new Map(itemsAgg.map((r) => [r.order_id, Number(r.custo_total_calc)]))

  const updates: any[] = []
  const rows: Array<[string, number, number, number, number]> = []
  for (const o of orders) {
    const orderId = o.id
    const tipo = (o.tipo_envio || '').toLowerCase()
    const receb = dec(o.recebimento_liquido)
    const custoTotalAtual = dec(o.custo_total)
    const custoFlexAtual = dec(o.custo_flex)

    const custoTotal = Number((custoMap.get(orderId) || 0).toFixed(2))
    let custoFlex = custoFlexAtual
    if (tipo === 'self_service' && !custoFlex) custoFlex = CUSTO_FLEX_PADRAO

    const lucroBruto = Number((receb - custoTotal - custoFlex).toFixed(2))
    const lucroLiquido = lucroBruto

    const changed =
      Math.abs(custoTotal - custoTotalAtual) > 0.01 ||
      Math.abs(custoFlex - custoFlexAtual) > 0.01 ||
      Math.abs(lucroBruto - dec(o.lucro_bruto)) > 0.01 ||
      Math.abs(lucroLiquido - dec(o.lucro_liquido)) > 0.01
    if (!changed) continue

    updates.push({
      order_number: o.order_number,
      tipo,
      custo_total: custoTotal,
      custo_flex: custoFlex,
      lucro_bruto: lucroBruto,
      lucro_liquido: lucroLiquido,
      receb,
    })
    rows.push([orderId, custoTotal, custoFlex, lucroBruto, lucroLiquido])
  }

  if (!dryRun && rows.length > 0) {
    const valuesSql = rows
      .map((_, i) =>
        `($${i * 5 + 1}::uuid, $${i * 5 + 2}::numeric, $${i * 5 + 3}::numeric, $${i * 5 + 4}::numeric, $${i * 5 + 5}::numeric)`
      )
      .join(',')
    const params = rows.flat()
    await prisma.$executeRawUnsafe(
      `UPDATE orders AS o SET
         custo_total = v.ct,
         custo_flex = v.cf,
         lucro_bruto = v.lb,
         lucro_liquido = v.ll
       FROM (VALUES ${valuesSql}) AS v(id, ct, cf, lb, ll)
       WHERE o.id = v.id`,
      ...params,
    )
  }
  return { total_analisadas: orders.length, atualizadas: updates.length, dry_run: dryRun, offset, sample: updates.slice(0, 50) }
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || ''
    const { searchParams } = new URL(req.url)
    const secret = searchParams.get('secret')
    if (secret !== 'LUXO2026' && !authHeader.startsWith('Basic ')) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }
    const days = Number(searchParams.get('days') || 120)
    const offset = Number(searchParams.get('offset') || 0)
    const batch = Number(searchParams.get('limit') || 500)
    const r = await run(true, days, offset, batch)
    return NextResponse.json({ ok: true, ...r })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || ''
    if (!authHeader.startsWith('Basic ')) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }
    const { searchParams } = new URL(req.url)
    const days = Number(searchParams.get('days') || 120)
    const offset = Number(searchParams.get('offset') || 0)
    const batch = Number(searchParams.get('limit') || 500)
    const r = await run(false, days, offset, batch)
    return NextResponse.json({ ok: true, ...r })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}