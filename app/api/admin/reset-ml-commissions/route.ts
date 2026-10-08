import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * Limpa os campos de comissão/frete que foram populados errados
 * (vão ser preenchidos corretamente pelo backfill-ml-commissions)
 *
 * GET /api/admin/reset-ml-commissions?secret=LUXO2026&confirm=1
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const secret = searchParams.get('secret')
    const confirm = searchParams.get('confirm')
    if (secret !== 'LUXO2026' || confirm !== '1') {
      return NextResponse.json({ ok: false, error: 'precisa ?secret=LUXO2026&confirm=1' }, { status: 401 })
    }

    const result = await prisma.orders.updateMany({
      where: {
        origem: 'mercado_livre',
        comissao_seller_valor: { not: null },
      },
      data: {
        comissao_seller_pct: null,
        comissao_seller_valor: null,
        frete: null,
      },
    })

    return NextResponse.json({
      ok: true,
      mensagem: `Reset OK em ${result.count} orders. Rode o backfill-ml-commissions pra preencher corretamente.`,
      count: result.count,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
