/**
 * GET /api/admin/vendas-hoje?company_id=X
 *
 * Resumo de vendas do dia (00:00 BRT até agora BRT).
 * Filtra por pago_em (ou created_at fallback) na janela de 24h BRT.
 *
 * Resposta: { ok, total_vendas, total_receita, total_recebimento, total_custo, margem_reais, margem_pct }
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

function fmtBRL(v: number): string {
  return v.toFixed(2)
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const companyId = searchParams.get('company_id')

    // Janela: HOJE BRT (00:00 até agora)
    // BRT = UTC-3 → 00:00 BRT = 03:00 UTC
    const agora = new Date()
    const dataBRT = agora.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) // YYYY-MM-DD
    const inicioBRT = new Date(`${dataBRT}T00:00:00-03:00`)
    const fimBRT = new Date(`${dataBRT}T23:59:59-03:00`)

    const where: any = {
      OR: [
        { pago_em: { gte: inicioBRT, lte: fimBRT } },
        { AND: [{ pago_em: null }, { created_at: { gte: inicioBRT, lte: fimBRT } }] },
      ],
    }
    if (companyId) where.company_id = companyId

    const orders = await prisma.orders.findMany({
      where,
      select: {
        total: true,
        comissao_seller_valor: true,
        frete: true,
        recebimento_liquido: true,
        custo_total: true,
        custo_flex: true,
        status: true,
      },
    })

    let totalVendas = 0, totalReceita = 0, totalReceb = 0, totalCusto = 0, totalCanceladas = 0
    for (const o of orders) {
      const st = String(o.status || '').toLowerCase()
      if (['cancelado', 'cancelada', 'devolvido', 'devolvida', 'cancelled', 'refunded'].includes(st)) {
        totalCanceladas++
        continue
      }
      totalVendas++
      const v = Number(o.total || 0)
      const r = Number(o.recebimento_liquido || 0) || Math.max(0, v - Number(o.comissao_seller_valor || 0) - Number(o.frete || 0))
      const c = Number(o.custo_total || 0) + Number(o.custo_flex || 0)
      totalReceita += v
      totalReceb += r
      totalCusto += c
    }

    const margemReais = totalReceb - totalCusto
    const margemPct = totalReceb > 0 ? (margemReais / totalReceb * 100) : 0

    return NextResponse.json({
      ok: true,
      periodo: { inicio: inicioBRT.toISOString(), fim: fimBRT.toISOString() },
      total_vendas: totalVendas,
      total_canceladas: totalCanceladas,
      total_geral: orders.length,
      total_receita: fmtBRL(totalReceita),
      total_recebimento: fmtBRL(totalReceb),
      total_custo: fmtBRL(totalCusto),
      margem_reais: fmtBRL(margemReais),
      margem_pct: margemPct.toFixed(1),
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}