/**
 * POST /api/admin/orders/marcar-parceiro
 *
 * Marca a venda como "impressa por" um parceiro (proxy de "comprou de mim").
 *
 * Body: { order_id, partner_company_id, partner_user_id? }
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { order_id, partner_company_id, partner_user_id } = body

    if (!order_id || !partner_company_id) {
      return NextResponse.json({ ok: false, error: 'order_id e partner_company_id obrigatórios' }, { status: 400 })
    }

    await prisma.$executeRawUnsafe(`
      UPDATE orders
      SET impressa_por_company_id = $1::uuid,
          impressa_por_user_id = $2::uuid,
          etiqueta_impressa_em = COALESCE(etiqueta_impressa_em, NOW())
      WHERE id = $3::uuid
    `, partner_company_id, partner_user_id || null, order_id)

    return NextResponse.json({ ok: true, message: 'Parceiro registrado' })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
