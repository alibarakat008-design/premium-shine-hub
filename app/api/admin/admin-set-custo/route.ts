/**
 * Admin: cadastra custo de produtos via Basic Auth (sem precisar de cookie de sessão)
 *
 * POST /api/admin/admin-set-custo
 * Body: { sku: string, custo: number, company_id?: string }
 *
 * GET /api/admin/admin-set-custo (help)
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const BASIC = 'Basic ' + Buffer.from('premium:shine2026').toString('base64')
const LIURA = 'e2633570-74da-4b14-9ca1-ba7b0670e612'

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== BASIC) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  let body: any = {}
  try { body = await req.json() } catch {}
  const sku = String(body.sku || '').trim()
  const custo = Number(body.custo)
  const companyId = body.company_id || LIURA
  const precoVenda = body.preco_venda !== undefined ? Number(body.preco_venda) : null

  if (!sku || isNaN(custo) || custo < 0) {
    return NextResponse.json({ ok: false, error: 'sku e custo obrigatórios' }, { status: 400 })
  }

  try {
    // 1) Acha o produto
    const prod = await prisma.products.findUnique({
      where: { sku },
      select: { id: true, nome: true },
    })
    if (!prod) {
      return NextResponse.json({ ok: false, error: `SKU ${sku} não encontrado` }, { status: 404 })
    }

    // 2) UPSERT em product_prices
    const existing = await prisma.product_prices.findFirst({
      where: { product_id: prod.id, company_id: companyId, canal: 'mercado_livre' },
    })

    const data: any = {
      product_id: prod.id,
      company_id: companyId,
      canal: 'mercado_livre',
      custo,
      updated_at: new Date(),
    }
    if (precoVenda !== null) data.preco_venda = precoVenda
    if (!existing) data.preco_venda = precoVenda ?? 0

    let result
    if (existing) {
      result = await prisma.product_prices.update({
        where: { id: existing.id },
        data: { custo, updated_at: new Date() },
      })
    } else {
      result = await prisma.product_prices.create({
        data: { ...data, preco_venda: precoVenda ?? 0 },
      })
    }

    // 3) Propaga custo pra order_items existentes (só atualiza onde tava NULL/0)
    const updated = await prisma.$executeRawUnsafe(`
      UPDATE order_items oi
      SET custo_unitario = $3::numeric
      FROM orders o
      WHERE o.id = oi.order_id
        AND oi.product_id = $1::uuid
        AND o.company_id = $2::uuid
        AND (oi.custo_unitario IS NULL OR oi.custo_unitario = 0)
    `, prod.id, companyId, custo)

    return NextResponse.json({
      ok: true,
      sku,
      produto: prod.nome,
      custo,
      preco_venda: result.preco_venda,
      order_items_atualizados: updated,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: 'POST /api/admin/admin-set-custo',
    body: { sku: 'MLB...', custo: 99.99, company_id: '... (opcional)', preco_venda: 199.99 },
    info: 'Cadastra custo e propaga pra order_items que estavam NULL/0 (retroativo)',
  })
}
