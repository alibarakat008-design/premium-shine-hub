import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// GET /api/admin/find-high-bonus?min=3&limit=200
// Lista vendas com bonus_envio_valor acima do threshold (suspeito)
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const min = Number(searchParams.get('min') || 3)
    const limit = Number(searchParams.get('limit') || 200)
    const rows: any[] = await prisma.$queryRawUnsafe(`
      SELECT order_number, pack_id, tipo_envio, total, frete,
             bonus_envio_valor, bonus_cupom_valor, comissao_seller_valor,
             recebimento_liquido, created_at
      FROM orders
      WHERE origem = 'mercado_livre'
        AND created_at > NOW() - INTERVAL '90 days'
        AND bonus_envio_valor > ${min}
      ORDER BY bonus_envio_valor DESC
      LIMIT ${limit}
    `)
    return NextResponse.json({ ok: true, count: rows.length, min, rows })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}