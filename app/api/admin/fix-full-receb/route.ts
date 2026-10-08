import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// POST /api/admin/fix-full-receb
// Corrigir TODAS vendas FULL (fulfillment) com:
//   - bonus_envio_valor zerado (FULL não tem bônus por envio — ML desconta frete direto)
//   - bonus_cupom_valor = max(0, tarifa_pct_valor - comissao_seller_valor) (cupom implícito)
//   - recebimento_liquido recalculado (venda - 12% - frete + bonus_cupom)
//
// GET opcional para DRY-RUN (não altera DB, só mostra)

const dec = (d: any) => (d ? Number(d.toString()) : 0)

export async function POST(req: Request) {
  const t0 = Date.now()
  const body = await req.json().catch(() => ({}))
  const dryRun = body.dry_run === true
  const limit = Number(body.limit) || 5000

  try {
    const orders: any[] = await prisma.$queryRawUnsafe(`
      SELECT id, order_number, total, subtotal, frete,
             comissao_seller_valor, bonus_envio_valor, bonus_cupom_valor,
             tarifa_pct_valor, recebimento_liquido
      FROM orders
      WHERE tipo_envio = 'fulfillment'
        AND origem = 'mercado_livre'
        AND created_at > NOW() - INTERVAL '90 days'
      ORDER BY created_at DESC
      LIMIT ${limit}
    `)

    const updates: any[] = []
    for (const o of orders) {
      const venda = dec(o.total)
      const frete = dec(o.frete)
      const comissaoSeller = dec(o.comissao_seller_valor)
      const tarifaPct = venda * 0.12  // regra fixa
      const novoBonusCupom = Number(Math.max(0, tarifaPct - comissaoSeller).toFixed(2))
      // FULL: bonus_envio = 0 (ML desconta frete, não repassa bônus)
      const novoBonusEnvio = 0
      // FULL: receb = venda - 12% - frete + bonus_cupom
      const novoReceb = Number((venda - tarifaPct - frete + novoBonusCupom).toFixed(2))

      const changed =
        dec(o.bonus_envio_valor) !== novoBonusEnvio ||
        dec(o.bonus_cupom_valor) !== novoBonusCupom ||
        Number(dec(o.recebimento_liquido).toFixed(2)) !== novoReceb

      if (!changed) continue
      updates.push({ id: o.id, order_number: o.order_number, anterior: { bonus_envio: dec(o.bonus_envio_valor), bonus_cupom: dec(o.bonus_cupom_valor), receb: dec(o.recebimento_liquido) }, novo: { bonus_envio: novoBonusEnvio, bonus_cupom: novoBonusCupom, receb: novoReceb } })

      if (!dryRun) {
        await prisma.$executeRawUnsafe(
          `UPDATE orders SET bonus_envio_valor = $1, bonus_cupom_valor = $2, recebimento_liquido = $3, tarifa_pct_valor = $4 WHERE id = $5::uuid`,
          novoBonusEnvio, novoBonusCupom, novoReceb, Number(tarifaPct.toFixed(2)), o.id,
        )
      }
    }

    return NextResponse.json({
      ok: true,
      dry_run: dryRun,
      elapsed_ms: Date.now() - t0,
      total_analisadas: orders.length,
      corrigidas: updates.length,
      updates: updates.slice(0, 50),
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

export async function GET() {
  return POST(new Request('http://x', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ dry_run: true }) }))
}