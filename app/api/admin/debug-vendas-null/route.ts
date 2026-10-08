// Debug correto
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

const BASIC = 'Basic ' + Buffer.from('premium:shine2026').toString('base64')
const LIURA = 'e2633570-74da-4b14-9ca1-ba7b0670e612'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== BASIC) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }
  try {
    // Quantas vendas TÊM ALGUM item com custo NULL (qualquer um)
    const r: any[] = await prisma.$queryRawUnsafe(`
      WITH vendas_com_null AS (
        SELECT DISTINCT o.id, o.order_number
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        WHERE o.company_id = $1::uuid
          AND o.origem = 'mercado_livre'::order_origem
          AND o.status != 'cancelado'
          AND oi.custo_unitario IS NULL
      )
      SELECT COUNT(*)::int as vendas_com_item_null FROM vendas_com_null
    `, LIURA)
    return NextResponse.json({ ok: true, ...r[0] })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message })
  } finally {
    await prisma.$disconnect()
  }
}
