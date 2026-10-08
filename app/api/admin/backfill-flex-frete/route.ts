/**
 * Backfill: pra orders FLEX (tipo_envio='self_service'),
 * zera o frete (ML não desconta em Flex — vendedor paga carrier à parte)
 * e recalcula recebimento_liquido = total - comissao
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

  const dryRun = searchParams.get('dry') === '1'
  const t0 = Date.now()

  try {
    // Pega orders FLEX com frete > 0
    const orders = await prisma.orders.findMany({
      where: {
        tipo_envio: 'self_service',
        frete: { gt: 0 },
      },
      select: {
        id: true,
        order_number: true,
        total: true,
        comissao_seller_valor: true,
        frete: true,
        recebimento_liquido: true,
      },
      take: 500,
    })

    console.log(`[Backfill flex frete] ${orders.length} orders FLEX com frete > 0`)

    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        total: orders.length,
        exemplo: orders.slice(0, 5).map((o) => ({
          order_number: o.order_number,
          total: Number(o.total),
          comissao: Number(o.comissao_seller_valor || 0),
          frete_atual: Number(o.frete),
          recebimento_atual: Number(o.recebimento_liquido),
          recebimento_correto: Number(o.total) - Number(o.comissao_seller_valor || 0),
        })),
      })
    }

    let atualizadas = 0
    for (const o of orders) {
      const novoRecebimento = Number(o.total) - Number(o.comissao_seller_valor || 0)
      await prisma.orders.update({
        where: { id: o.id },
        data: {
          frete: 0,
          recebimento_liquido: Math.max(0, novoRecebimento),
        },
      })
      atualizadas++
    }

    return NextResponse.json({
      ok: true,
      total: orders.length,
      atualizadas,
      duracao_ms: Date.now() - t0,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}