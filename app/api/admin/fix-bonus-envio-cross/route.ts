/**
 * FIX: bonus_envio tá ERRADO pra cross_docking/agency/xd_dropoff
 *
 * Fórmula canônica (jun 2026, validada):
 *   - FLEX (self_service): receb = venda - tarifa_pct - tarifa_fixa + bonus_envio + bonus_cupom
 *   - FULL (fulfillment):  receb = venda - tarifa_pct - sender_cost + bonus_cupom (SEM fixa, SEM bonus_envio)
 *   - cross / agency / xd_dropoff: receb = venda - tarifa_pct - sender_cost + bonus_cupom (SEM bonus_envio)
 *
 * Mas o sync gravou bonus_envio = (base_cost - list_cost) pra cross, o que é o desconto do BUYER, não do seller.
 *
 * Este endpoint:
 *  1. Zera bonus_envio_valor pra vendas cross/agency/xd_dropoff
 *  2. Recalcula recebimento_liquido = MAX(0, total - tarifa_pct - tarifa_fixa - frete + bonus_cupom)
 *     (sender.cost já tá gravado em orders.frete, então subtrai)
 *
 * GET /api/admin/fix-bonus-envio-cross?company_id=X&secret=LUXO2026
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

const BASIC = 'Basic ' + Buffer.from('premium:shine2026').toString('base64')
const SECRET = 'LUXO2026'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== BASIC) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }
  const { searchParams } = new URL(req.url)
  if (searchParams.get('secret') !== SECRET) {
    return NextResponse.json({ ok: false, error: 'Secret inválido' }, { status: 401 })
  }
  const companyId = searchParams.get('company_id') // opcional

  try {
    // 1) Conta quantas vendas serão afetadas (cross/agency/xd_dropoff)
    const count: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        tipo_envio,
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE bonus_envio_valor > 0)::int as com_bonus_envio
      FROM orders
      WHERE origem = 'mercado_livre'::order_origem
        AND status != 'cancelado'
        AND tipo_envio IN ('cross_docking', 'agency', 'xd_dropoff')
        ${companyId ? `AND company_id = $1::uuid` : ''}
      GROUP BY tipo_envio
      ORDER BY tipo_envio
    `, ...(companyId ? [companyId] : []))

    console.log('[fix-bonus-envio-cross] Afetadas:', count)

    // 2) Atualiza: zera bonus_envio_valor + recalcula recebimento_liquido
    // Fórmula correta: receb = MAX(0, total - tarifa_pct - tarifa_fixa - frete + bonus_cupom)
    // Onde:
    //   total = orders.total
    //   tarifa_pct = orders.tarifa_pct_valor (já é 12%)
    //   tarifa_fixa = orders.tarifa_fixa_valor (0 em cross/agency/xd)
    //   frete = orders.frete (sender.cost)
    //   bonus_cupom = orders.bonus_cupom_valor
    const update: any = await prisma.$queryRawUnsafe(`
      UPDATE orders
      SET
        bonus_envio_valor = 0,
        recebimento_liquido = GREATEST(0,
          COALESCE(total, 0)
          - COALESCE(tarifa_pct_valor, 0)
          - COALESCE(tarifa_fixa_valor, 0)
          - COALESCE(frete, 0)
          + COALESCE(bonus_cupom_valor, 0)
        ),
        updated_at = NOW()
      WHERE origem = 'mercado_livre'::order_origem
        AND status != 'cancelado'
        AND tipo_envio IN ('cross_docking', 'agency', 'xd_dropoff')
        ${companyId ? `AND company_id = $1::uuid` : ''}
      RETURNING id
    `, ...(companyId ? [companyId] : []))

    return NextResponse.json({
      ok: true,
      mensagem: `✅ Corrigido: ${update.length} vendas (cross/agency/xd_dropoff) com bonus_envio zerado + recebimento recalculado`,
      vendas_afetadas_por_tipo: count,
      total_corrigidas: update.length,
      formula_aplicada: 'recebimento = MAX(0, total - tarifa_pct - tarifa_fixa - frete + bonus_cupom)',
      observacao: 'bonus_envio_valor foi zerado pq em cross/agency/xd o "bônus" que o sync gravou era na verdade o desconto do BUYER (base_cost - list_cost), não dinheiro que vai pro seller. A fórmula correta (jun 2026) é: receba = venda - comissão - frete_seller + bonus_cupom.',
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message, stack: err.stack?.substring(0, 800) }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}
