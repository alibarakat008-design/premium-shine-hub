/**
 * Diagnóstico: quantos produtos JÁ TÊM custo cadastrado vs quantos items ainda não foram propagados
 * GET /api/admin/diagnostico-custo?company_id=X
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const BASIC = 'Basic ' + Buffer.from('premium:shine2026').toString('base64')
const LIURA = 'e2633570-74da-4b14-9ca1-ba7b0670e612'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== BASIC) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }
  const { searchParams } = new URL(req.url)
  const companyId = searchParams.get('company_id') || LIURA

  try {
    // 1) Quantos produtos têm custo cadastrado
    const comCusto: any[] = await prisma.$queryRawUnsafe(`
      SELECT COUNT(DISTINCT product_id)::int as produtos_com_custo
      FROM product_prices
      WHERE company_id = $1::uuid
        AND custo > 0
        AND canal = 'mercado_livre'::canal_venda
    `, companyId)

    // 2) Quantos produtos têm vendas
    const comVendas: any[] = await prisma.$queryRawUnsafe(`
      SELECT COUNT(DISTINCT product_id)::int as produtos_com_vendas
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.company_id = $1::uuid
        AND o.origem = 'mercado_livre'::order_origem
        AND oi.product_id IS NOT NULL
    `, companyId)

    // 3) Quantos items SEM custo E produto TEM custo (esses podem ser propagados)
    const propagaveis: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        COUNT(*)::int as itens_propagaveis,
        COUNT(DISTINCT oi.product_id)::int as produtos_propagaveis,
        SUM(oi.quantidade)::int as unidades_propagaveis,
        COALESCE(SUM(pp.custo * oi.quantidade), 0)::float as cmv_que_vai_somar
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      JOIN product_prices pp
        ON pp.product_id = oi.product_id
        AND pp.company_id = $1::uuid
        AND pp.custo > 0
      WHERE o.company_id = $1::uuid
        AND o.origem = 'mercado_livre'::order_origem
        AND o.status != 'cancelado'
        AND oi.product_id IS NOT NULL
        AND (oi.custo_unitario IS NULL OR oi.custo_unitario = 0)
    `, companyId)

    // 4) Items que NUNCA terão custo (produto sem custo cadastrado)
    const orfaos: any[] = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*)::int as itens_orfaos
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.company_id = $1::uuid
        AND o.origem = 'mercado_livre'::order_origem
        AND o.status != 'cancelado'
        AND oi.product_id IS NOT NULL
        AND (oi.custo_unitario IS NULL OR oi.custo_unitario = 0)
        AND NOT EXISTS (
          SELECT 1 FROM product_prices pp
          WHERE pp.product_id = oi.product_id
            AND pp.company_id = $1::uuid
            AND pp.custo > 0
        )
    `, companyId)

    return NextResponse.json({
      ok: true,
      company_id: companyId,
      produtos_com_custo_cadastrado: comCusto[0]?.produtos_com_custo || 0,
      produtos_com_vendas: comVendas[0]?.produtos_com_vendas || 0,
      itens_propagaveis_agora: propagaveis[0]?.itens_propagaveis || 0,
      produtos_propagaveis: propagaveis[0]?.produtos_propagaveis || 0,
      unidades_propagaveis: propagaveis[0]?.unidades_propagaveis || 0,
      cmv_que_vai_somar: propagaveis[0]?.cmv_que_vai_somar || 0,
      itens_orfaos_sem_custo_nunca: orfaos[0]?.itens_orfaos || 0,
      explicacao: 'Produtos com custo cadastrado MAS items antigos sem propagar → vou propagar agora. Orfãos = produtos que NUNCA tiveram custo cadastrado (precisam cadastrar).',
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message, stack: err.stack?.substring(0, 500) }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}
