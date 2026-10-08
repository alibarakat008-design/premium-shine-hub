/**
 * Backfill: preenche tarifa_pct_valor, tarifa_fixa_valor, bonus_cupom_valor, bonus_envio_valor
 * pra orders que já existem. Cálculo:
 *   - tarifa_pct_valor = total * 0.12
 *   - bonus_envio_valor = já salvo em tipo_envio='fulfillment' (base_cost - list_cost) — já calculado via backfill-flex
 *   - bonus_cupom_valor = orders.desconto - bonus_envio_valor (se positivo)
 *   - tarifa_fixa_valor = comissao_seller_valor + bonus_cupom_valor - tarifa_pct_valor
 *
 * GET /api/admin/backfill-ml-tarifa?secret=LUXO2026
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || ''
  const { searchParams } = new URL(req.url)
  const secret = searchParams.get('secret')
  if (secret !== 'LUXO2026' && !authHeader.startsWith('Basic ')) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const t0 = Date.now()

  try {
    // UPDATE em batch via SQL — uma única operação
    // bonus_envio_valor: para FLEX (tipo_envio='self_service'), usamos a diferença
    // entre list_cost (que tá em orders.frete original) e base_cost. Mas orders.frete já
    // foi zerado para FLEX. Então: pra FLEX, bonus_envio já tá em orders.recebimento_liquido
    // implícito (recebimento = total - comissao + bonus_envio).
    //
    // Para simplificar: usamos orders.desconto como base e separamos:
    //   - bonus_envio_valor = base_cost - list_cost (pequeno, ~R$1, típico em FLEX)
    //     Vamos buscar isso via orders.frete vs orders.total...
    //   - mas orders.frete foi zerado pra FLEX no backfill anterior.
    //
    // Solução pragmática: deixar bonus_envio = 0 pra orders antigas. Apenas calcular
    // tarifa_pct_valor (12%) e bonus_cupom_valor = orders.desconto. O tarifa_fixa_valor
    // vai ficar zerado também — e o tooltip mostrará "detalhamento parcial".
    //
    // Pra orders novas (vindas do sync novo), os 4 campos são preenchidos corretamente.

    const result = await prisma.$executeRawUnsafe(`
      UPDATE orders
      SET
        tarifa_pct_valor = ROUND(total * 0.12, 2),
        bonus_cupom_valor = COALESCE(desconto, 0),
        -- tarifa_fixa_valor: inferir da comissão líquida - pct + cupom
        -- comissao_bruta = comissao_seller_valor + orders.desconto (cupom volta como estorno)
        -- tarifa_fixa = comissao_bruta - tarifa_pct_valor
        tarifa_fixa_valor = GREATEST(
          0,
          ROUND(
            (COALESCE(comissao_seller_valor, 0) + COALESCE(desconto, 0)) - ROUND(total * 0.12, 2),
            2
          )
        )
      WHERE origem = 'mercado_livre'
        AND total IS NOT NULL
        AND (tarifa_pct_valor IS NULL OR bonus_cupom_valor IS NULL)
    `)

    // Conta quantos ainda não têm bonus_envio (vai ficar 0 pra orders antigas — OK)
    const restantes = await prisma.$queryRawUnsafe<any[]>(`
      SELECT COUNT(*) as total
      FROM orders
      WHERE origem = 'mercado_livre'
        AND tipo_envio = 'self_service'
        AND bonus_envio_valor IS NULL
    `)

    return NextResponse.json({
      ok: true,
      atualizados: result,
      restantes_sem_bonus_envio: Number(restantes[0]?.total || 0),
      duracao_ms: Date.now() - t0,
      nota: 'orders antigas têm bonus_envio=0 (não foi salvo no sync antigo). Orders novas (pós-migration) terão todos os campos.',
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}