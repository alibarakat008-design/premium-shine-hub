/**
 * Diagnostico + corrige vendas com bonus_cupom_valor absurdo.
 * "Absurdo" = bonus_cupom > 30% do total OU bonus_cupom > tarifa_pct.
 *
 * Recalcula pela formula canonica: cupom_implicito = max(0, tarifa_pct - sale_fee).
 * Atualiza bonus_cupom_valor E recebimento_liquido (com base no tipo_envio).
 *
 * GET  /api/admin/fix-cupom-absurdo   -> dry run
 * POST /api/admin/fix-cupom-absurdo   -> aplica (pagina 500 em loop)
 *      ?maxPct=0.3 (limite de cupom vs total, default 0.3 = 30%)
 *      ?limit=500&offset=0
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const dec = (d: any) => (d ? Number(d.toString()) : 0)

async function run(dryRun: boolean, maxPct: number, offset: number, batch: number) {
  // Critérios de "absurdo":
  //  1) bonus_cupom_valor > maxPct * total  (cupom gigante em relação à venda)
  //  2) bonus_cupom_valor > tarifa_pct_valor (cupom > tarifa, impossível por definição)
  const threshold = maxPct
  const orders: any[] = await prisma.$queryRawUnsafe(`
    SELECT id, order_number, tipo_envio, total, frete,
           comissao_seller_valor, bonus_envio_valor, bonus_cupom_valor,
           tarifa_pct_valor, recebimento_liquido
    FROM orders
    WHERE origem = 'mercado_livre'
      AND comissao_seller_valor IS NOT NULL
      AND comissao_seller_valor > 0
      AND total IS NOT NULL
      AND total > 0
      AND tipo_envio IS NOT NULL
      AND created_at > NOW() - INTERVAL '120 days'
      AND (
        (bonus_cupom_valor IS NOT NULL AND bonus_cupom_valor > ${threshold}::numeric * total)
        OR (bonus_cupom_valor IS NOT NULL AND tarifa_pct_valor IS NOT NULL AND bonus_cupom_valor > tarifa_pct_valor)
      )
    ORDER BY created_at DESC
    LIMIT ${batch} OFFSET ${offset}
  `)

  const updates: any[] = []
  const rows: Array<[string, number, number, number]> = []
  for (const o of orders) {
    const tipo = (o.tipo_envio || '').toLowerCase()
    const venda = dec(o.total)
    const frete = dec(o.frete)
    const saleFee = dec(o.comissao_seller_valor)
    const bonusEnvio = dec(o.bonus_envio_valor)
    const bonusCupomAtual = dec(o.bonus_cupom_valor)

    // Fórmula canônica: cupom_implicito = max(0, tarifa_pct - sale_fee)
    const tarifaPct = venda * 0.12
    const novoBonusCupom = Math.max(0, Number((tarifaPct - saleFee).toFixed(2)))

    // Recalcula recebimento
    let novoReceb: number
    if (tipo === 'self_service') {
      novoReceb = Number((venda - tarifaPct + bonusEnvio + novoBonusCupom).toFixed(2))
    } else {
      novoReceb = Number((venda - tarifaPct - frete + novoBonusCupom).toFixed(2))
    }

    const cupomChanged = Math.abs(bonusCupomAtual - novoBonusCupom) > 0.01
    const recebChanged = Math.abs(dec(o.recebimento_liquido) - novoReceb) > 0.01
    if (!cupomChanged && !recebChanged) continue

    updates.push({
      order_number: o.order_number,
      tipo,
      venda,
      sale_fee: saleFee,
      cupom_anterior: bonusCupomAtual,
      cupom_novo: novoBonusCupom,
      receb_anterior: dec(o.recebimento_liquido),
      receb_novo: novoReceb,
    })
    rows.push([o.id, novoBonusCupom, Number(tarifaPct.toFixed(2)), novoReceb])
  }

  if (!dryRun && rows.length > 0) {
    const valuesSql = rows
      .map((_, i) => `($${i * 4 + 1}::uuid, $${i * 4 + 2}::numeric, $${i * 4 + 3}::numeric, $${i * 4 + 4}::numeric)`)
      .join(',')
    const params = rows.flat()
    await prisma.$executeRawUnsafe(
      `UPDATE orders AS o SET
         bonus_cupom_valor = v.cupom,
         tarifa_pct_valor = v.pct,
         recebimento_liquido = v.receb
       FROM (VALUES ${valuesSql}) AS v(id, cupom, pct, receb)
       WHERE o.id = v.id`,
      ...params,
    )
  }
  return { total_analisadas: orders.length, corrigidas: updates.length, dry_run: dryRun, max_pct: maxPct, offset, sample: updates.slice(0, 50) }
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || ''
    const { searchParams } = new URL(req.url)
    const secret = searchParams.get('secret')
    if (secret !== 'LUXO2026' && !authHeader.startsWith('Basic ')) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }
    const maxPct = Number(searchParams.get('maxPct') || 0.3)
    const offset = Number(searchParams.get('offset') || 0)
    const batch = Number(searchParams.get('limit') || 500)
    const r = await run(true, maxPct, offset, batch)
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
    const maxPct = Number(searchParams.get('maxPct') || 0.3)
    const offset = Number(searchParams.get('offset') || 0)
    const batch = Number(searchParams.get('limit') || 500)
    const r = await run(false, maxPct, offset, batch)
    return NextResponse.json({ ok: true, ...r })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}