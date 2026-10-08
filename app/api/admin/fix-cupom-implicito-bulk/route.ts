import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const dec = (d: any) => (d ? Number(d.toString()) : 0)

// Bulk: cupom_implicito = max(0, tarifa_pct - comissao_seller_valor)
//         para todas as vendas onde bonus_cupom_valor está 0 e dif > R$ 0,50
// Recalcula recebimento_liquido por tipo:
//   FLEX:  venda - 12% + bonus_envio + bonus_cupom
//   FULL/Cross: venda - 12% - frete + bonus_cupom
//
// GET = dry-run, POST {dry_run: false} = aplica

async function run(dryRun: boolean, offset = 0, batch = 500) {
  // IMPORTANTE: filtra tipo_envio NOT NULL pra não calcular receb errado (sem tipo, não dá pra saber
  // se desconta frete). Vendas sem tipo_envio são resolvidas pelo backfill-tipo-envio-fast.
  const orders: any[] = await prisma.$queryRawUnsafe(`
    SELECT id, order_number, tipo_envio, total, frete,
           comissao_seller_valor, bonus_envio_valor, bonus_cupom_valor,
           tarifa_pct_valor, recebimento_liquido
    FROM orders
    WHERE origem = 'mercado_livre'
      AND comissao_seller_valor IS NOT NULL
      AND comissao_seller_valor > 0
      AND tipo_envio IS NOT NULL
      AND created_at > NOW() - INTERVAL '120 days'
    ORDER BY created_at DESC
    LIMIT ${batch} OFFSET ${offset}
  `)

  const updates: any[] = []
  const rows: Array<[string, number, number, number]> = []
  for (const o of orders) {
    const tipo = (o.tipo_envio || '').toLowerCase()
    const venda = dec(o.total)
    const frete = dec(o.frete)
    const comissaoSeller = dec(o.comissao_seller_valor)
    const bonusEnvio = dec(o.bonus_envio_valor)
    const bonusCupomAtual = dec(o.bonus_cupom_valor)
    const tarifaPct = venda * 0.12
    // Fórmula SUBSTITUI (não acumula!) — se rodar várias vezes, mesmo resultado.
    const cupomImplicito = Math.max(0, Number((tarifaPct - comissaoSeller).toFixed(2)))
    const novoBonusCupom = cupomImplicito

    let novoReceb: number
    if (tipo === 'self_service') {
      // FLEX: frete passa pelo seller (não desconta)
      novoReceb = Number((venda - tarifaPct + bonusEnvio + novoBonusCupom).toFixed(2))
    } else {
      // FULL / cross_docking / xd_dropoff / agency: frete desconta
      novoReceb = Number((venda - tarifaPct - frete + novoBonusCupom).toFixed(2))
    }

    const cupomChanged = Number(bonusCupomAtual.toFixed(2)) !== Number(novoBonusCupom.toFixed(2))
    const recebChanged = Math.abs(dec(o.recebimento_liquido) - novoReceb) > 0.01
    if (!cupomChanged && !recebChanged) continue

    updates.push({
      id: o.id, order_number: o.order_number, tipo,
      anterior: { cupom: bonusCupomAtual, receb: dec(o.recebimento_liquido) },
      novo: { cupom: novoBonusCupom, receb: novoReceb },
    })
    rows.push([o.id, novoBonusCupom, Number(tarifaPct.toFixed(2)), novoReceb])
  }

  if (!dryRun && rows.length > 0) {
    // Bulk UPDATE via VALUES: 1 round-trip em vez de N
    const valuesSql = rows
      .map((_, i) => `($${i*4+1}::uuid, $${i*4+2}::numeric, $${i*4+3}::numeric, $${i*4+4}::numeric)`)
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
  return { total: orders.length, corrigidas: updates.length, offset, updates: updates.slice(0, 50) }
}

export async function POST(req: Request) {
  try {
    const url = new URL(req.url)
    const offset = Number(url.searchParams.get('offset') || 0)
    const batch = Number(url.searchParams.get('limit') || 500)
    const body = await req.json().catch(() => ({}))
    const r = await run(body.dry_run === true, offset, batch)
    return NextResponse.json({ ok: true, dry_run: body.dry_run === true, ...r })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const offset = Number(searchParams.get('offset') || 0)
    const batch = Number(searchParams.get('limit') || 500)
    const r = await run(true, offset, batch)
    return NextResponse.json({ ok: true, dry_run: true, ...r })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}