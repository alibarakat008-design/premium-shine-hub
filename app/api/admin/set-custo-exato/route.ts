/**
 * POST /api/admin/set-custo-exato
 *
 * Cadastra o custo REAL de um produto (pra empresa especificada).
 * Arredonda pra 2 casas decimais pra evitar float issues (20.01 em vez de 20).
 *
 * Body: { sku: string, custo: number, company_id?: string }
 * Se company_id omitido, usa a LIURAESSENCE (matriz) por padrão.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const DEFAULT_COMPANY_ID = 'e2633570-74da-4b14-9ca1-ba7b0670e612' // LIURAESSENCE

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { sku, custo } = body
    let companyId = body.company_id || DEFAULT_COMPANY_ID

    if (!sku || typeof custo !== 'number') {
      return NextResponse.json({
        ok: false,
        error: 'Precisa { sku, custo: number }',
      }, { status: 400 })
    }

    // Arredonda pra 2 casas decimais (evita 20.01 vindo de 20.005)
    const custoExato = Math.round(custo * 100) / 100

    // UPSERT em product_prices (canal='manual' pra diferenciar de sync ML)
    const sql = `
      INSERT INTO product_prices (product_id, company_id, preco_venda, custo, canal, updated_at)
      SELECT p.id, $3::uuid, COALESCE(pp.preco_venda, 0), $2, 'manual'::canal_venda, NOW()
      FROM products p
      LEFT JOIN product_prices pp ON pp.product_id = p.id AND pp.company_id = $3::uuid
      WHERE p.sku = $1
      ON CONFLICT (product_id, canal, company_id) DO UPDATE
      SET custo = EXCLUDED.custo, updated_at = NOW()
      RETURNING product_id, custo
    `
    const result: any[] = await prisma.$queryRawUnsafe(sql, sku, custoExato, companyId)

    if (!result || result.length === 0) {
      return NextResponse.json({
        ok: false,
        error: `SKU "${sku}" não encontrado no catálogo`,
      }, { status: 404 })
    }

    return NextResponse.json({
      ok: true,
      message: `Custo de ${sku} = R$ ${custoExato.toFixed(2)}`,
      sku,
      custo: custoExato,
      company_id: companyId,
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}