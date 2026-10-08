import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const total = await prisma.orders.count({
      where: { origem: 'mercado_livre' },
    })
    const pending = await prisma.orders.count({
      where: {
        origem: 'mercado_livre',
        OR: [
          { bonus_envio_valor: null },
          { bonus_cupom_valor: null },
          { bonus_cupom_valor: 0 },
        ],
      },
    })
    const updated = await prisma.orders.count({
      where: {
        origem: 'mercado_livre',
        bonus_cupom_valor: { gt: 0 },
      },
    })

    return NextResponse.json({ ok: true, total, pending, updated })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}