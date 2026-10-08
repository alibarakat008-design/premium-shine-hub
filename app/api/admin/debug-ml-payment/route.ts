import { NextResponse } from 'next/server'
import { getMLToken } from '@/lib/ml-auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * Pega o JSON COMPLETO do /payments/{id} do ML
 * GET /api/admin/debug-ml-payment?payment_id=163310487783
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const paymentId = searchParams.get('payment_id') || ''
    if (!paymentId) {
      // Pega um do banco
      const orders = await prisma.orders.findMany({
        where: { origem: 'mercado_livre' },
        select: { order_number: true, total: true },
        orderBy: { total: 'desc' },
        take: 5,
      })
      return NextResponse.json({
        ok: true,
        banco_top_orders: orders,
        mensagem: 'passe ?payment_id= pra inspecionar',
      })
    }

    const tokenResult = await getMLToken()
    if (!tokenResult?.token) {
      return NextResponse.json({ ok: false, error: 'token ML indisponível' }, { status: 500 })
    }

    const r = await fetch(`https://api.mercadolibre.com/payments/${paymentId}?access_token=${tokenResult.token}`)
    const j = await r.json()

    return NextResponse.json({
      ok: r.ok,
      status: r.status,
      payment_id: paymentId,
      json: j,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
