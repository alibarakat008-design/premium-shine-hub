import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

const BASIC = 'Basic ' + Buffer.from('premium:shine2026').toString('base64')

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== BASIC) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  const companyId = req.nextUrl.searchParams.get('company_id') || 'e2633570-74da-4b14-9ca1-ba7b0670e612'
  const order = req.nextUrl.searchParams.get('order') || '2000017513749482'
  try {
    const r: any[] = await prisma.$queryRawUnsafe(`
      SELECT order_number, custo_total, custo_flex, lucro_bruto, lucro_liquido,
             comissao_seller_valor, recebimento_liquido
      FROM orders WHERE order_number = $1 AND company_id = $2::uuid
    `, order, companyId)
    const count: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        COUNT(*) FILTER (WHERE comissao_seller_valor IS NULL) as nulas,
        COUNT(*) FILTER (WHERE comissao_seller_valor = 0) as zeros,
        COUNT(*) FILTER (WHERE comissao_seller_valor > 0) as positivas,
        COUNT(*) as total
      FROM orders WHERE company_id = $1::uuid AND origem = 'mercado_livre'::order_origem
    `, companyId)
    return NextResponse.json({ ok: true, sample: JSON.parse(JSON.stringify(r[0], (_, v) => typeof v === 'bigint' ? Number(v) : v)), counts: JSON.parse(JSON.stringify(count[0], (_, v) => typeof v === 'bigint' ? Number(v) : v)) })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message })
  } finally {
    await prisma.$disconnect()
  }
}
