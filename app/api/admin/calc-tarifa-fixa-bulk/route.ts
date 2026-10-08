import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// POST /api/admin/calc-tarifa-fixa-bulk
// tarifa_fixa_valor = max(0, comissao_seller_valor + bonus_cupom_valor - 12% × total)
// Roda só em vendas com tarifa_fixa_valor = 0 E sale_fee > 0 (anômalas).
// NUNCA chama ML API — usa dados já no banco.
// GET = dry-run
//
// IMPORTANTE: sale_fee já vem LÍQUIDO do ML (descontado do cupom).
// Então tarifa_bruta = sale_fee + cupom_implicito + cupom_explicito (= max(0, sale_fee + bonus_cupom))
// tarifa_pct = 12% × total_amount
// tarifa_fixa = max(0, tarifa_bruta - tarifa_pct)
//
// Atualiza: tarifa_fixa_valor E bonus_cupom_valor (se estava zerado e o cupom implícito deveria existir)
// Não recalcula recebimento — depende do tipo_envio, fica como está.

const dec = (d: any) => (d ? Number(d.toString()) : 0)

async function run(dryRun: boolean, offset = 0, batch = 2000) {
  const orders: any[] = await prisma.$queryRawUnsafe(`
    SELECT id, order_number, tipo_envio, total,
           comissao_seller_valor, bonus_cupom_valor, tarifa_pct_valor,
           tarifa_fixa_valor, recebimento_liquido
    FROM orders
    WHERE origem = 'mercado_livre'
      AND created_at > NOW() - INTERVAL '120 days'
      AND comissao_seller_valor IS NOT NULL
      AND comissao_seller_valor > 0
      AND total IS NOT NULL
      AND total > 0
      AND total <= 79
      AND (tarifa_fixa_valor IS NULL OR tarifa_fixa_valor = 0)
      AND tipo_envio IS NOT NULL
    ORDER BY created_at DESC
    LIMIT ${batch} OFFSET ${offset}
  `)

  const updates: any[] = []
  const rows: Array<[string, number, number]> = []
  for (const o of orders) {
    const total = dec(o.total)
    const saleFee = dec(o.comissao_seller_valor)
    const cupom = dec(o.bonus_cupom_valor)
    const tarifaPct = total * 0.12
    const tarifaBruta = saleFee + cupom
    const tarifaFixa = Math.max(0, Number((tarifaBruta - tarifaPct).toFixed(2)))

    if (tarifaFixa < 0.01) continue

    updates.push({
      order_number: o.order_number,
      tipo: o.tipo_envio,
      venda: total,
      sale_fee: saleFee,
      cupom: cupom,
      tarifa_pct_atual: dec(o.tarifa_pct_valor),
      tarifa_fixa_nova: tarifaFixa,
      receb_fica: dec(o.recebimento_liquido),
    })
    rows.push([o.id, tarifaFixa, Number(tarifaPct.toFixed(2))])
  }

  if (!dryRun && rows.length > 0) {
    const valuesSql = rows
      .map((_, i) => `($${i*3+1}::uuid, $${i*3+2}::numeric, $${i*3+3}::numeric)`)
      .join(',')
    const params = rows.flat()
    await prisma.$executeRawUnsafe(
      `UPDATE orders AS o SET
         tarifa_fixa_valor = v.fixa,
         tarifa_pct_valor = v.pct
       FROM (VALUES ${valuesSql}) AS v(id, fixa, pct)
       WHERE o.id = v.id`,
      ...params,
    )
  }
  return { total_analisadas: orders.length, com_tarifa_fixa: updates.length, dry_run: dryRun, offset, sample: updates.slice(0, 30) }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const offset = Number(searchParams.get('offset') || 0)
    const batch = Number(searchParams.get('limit') || 2000)
    const r = await run(true, offset, batch)
    return NextResponse.json({ ok: true, dry_run: true, ...r })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const offset = Number(searchParams.get('offset') || 0)
    const batch = Number(searchParams.get('limit') || 2000)
    const r = await run(false, offset, batch)
    return NextResponse.json({ ok: true, dry_run: false, ...r })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}