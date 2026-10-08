import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const dec = (d: any) => (d ? Number(d.toString()) : 0)

// POST /api/admin/fix-bonus-envio-by-type
// Regra: bonus_envio_valor = 0 para FULL e cross_docking (ML desconta frete direto, não repassa bônus)
// Para FLEX (self_service): manter valor do DB se plausível (< R$ 5 senão zera)
// Recalcula recebimento_liquido de acordo com tipo após zerar.
//
// GET = DRY_RUN

async function process(dryRun: boolean, offset = 0, batch = 5000) {
  const orders: any[] = await prisma.$queryRawUnsafe(`
    SELECT id, order_number, tipo_envio, total, subtotal, frete,
           comissao_seller_valor, bonus_envio_valor, bonus_cupom_valor,
           tarifa_pct_valor, tarifa_fixa_valor, recebimento_liquido
    FROM orders
    WHERE origem = 'mercado_livre'
      AND tipo_envio IS NOT NULL
      AND created_at > NOW() - INTERVAL '120 days'
    ORDER BY created_at DESC
    LIMIT ${batch} OFFSET ${offset}
  `)

  const updates: any[] = []
  const rows: Array<[string, number, number]> = []
  for (const o of orders) {
    const tipo = (o.tipo_envio || '').toLowerCase()
    const venda = dec(o.total)
    const subtotal = dec(o.subtotal)
    const frete = dec(o.frete)
    const comissaoSeller = dec(o.comissao_seller_valor)
    const bonusEnvioAtual = dec(o.bonus_envio_valor)
    const bonusCupom = dec(o.bonus_cupom_valor)
    const tarifaPct = venda * 0.12

    let novoBonusEnvio = bonusEnvioAtual

    if (tipo === 'fulfillment' || tipo === 'cross_docking' || tipo === 'xd_dropoff') {
      novoBonusEnvio = 0
    } else if (tipo === 'self_service') {
      if (bonusEnvioAtual > 5) novoBonusEnvio = 0
    } else {
      if (bonusEnvioAtual > 5) novoBonusEnvio = 0
    }

    let novoReceb: number
    if (tipo === 'self_service') {
      novoReceb = Number((venda - tarifaPct + novoBonusEnvio + bonusCupom).toFixed(2))
    } else {
      novoReceb = Number((venda - tarifaPct - frete + bonusCupom).toFixed(2))
    }

    const bonusChanged = Number(bonusEnvioAtual.toFixed(2)) !== Number(novoBonusEnvio.toFixed(2))
    const recebChanged = Math.abs(dec(o.recebimento_liquido) - novoReceb) > 0.01

    if (!bonusChanged && !recebChanged) continue
    updates.push({
      id: o.id,
      order_number: o.order_number,
      tipo,
      anterior: { bonus_envio: bonusEnvioAtual, receb: dec(o.recebimento_liquido) },
      novo: { bonus_envio: novoBonusEnvio, receb: novoReceb },
    })
    rows.push([o.id, novoBonusEnvio, novoReceb])
  }

  if (!dryRun && rows.length > 0) {
    const valuesSql = rows
      .map((_, i) => `($${i*3+1}::uuid, $${i*3+2}::numeric, $${i*3+3}::numeric)`)
      .join(',')
    const params = rows.flat()
    await prisma.$executeRawUnsafe(
      `UPDATE orders AS o SET
         bonus_envio_valor = v.bonus,
         recebimento_liquido = v.receb
       FROM (VALUES ${valuesSql}) AS v(id, bonus, receb)
       WHERE o.id = v.id`,
      ...params,
    )
  }

  return {
    total: orders.length,
    corrigidas: updates.length,
    offset,
    updates: updates.slice(0, 50),
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const dryRun = body.dry_run === true
    const r = await process(dryRun)
    return NextResponse.json({ ok: true, dry_run: dryRun, ...r })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

export async function GET() {
  try {
    const r = await process(true)
    return NextResponse.json({ ok: true, dry_run: true, ...r })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}