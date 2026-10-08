/**
 * Lucro Armaf Club LIURA (custo parametrizável)
 * GET /api/admin/lucro-produto?q=Armaf%20Club&custo=179
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const BASIC = 'Basic ' + Buffer.from('premium:shine2026').toString('base64')
const LIURA_COMPANY = 'e2633570-74da-4b14-9ca1-ba7b0670e612'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== BASIC) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q') || 'Armaf Club'
  const custo = Number(searchParams.get('custo') || 179)

  try {
    const where = q.split(/\s+/).map((_, i) => `oi.nome_produto ILIKE $${i + 1}`).join(' AND ')
    const params = q.split(/\s+/).map(t => `%${t}%`)

    // Resumo agregado
    const resumo: any[] = await prisma.$queryRawUnsafe(`
      WITH vendas AS (
        SELECT
          oi.quantidade,
          oi.preco_unitario,
          o.recebimento_liquido,
          o.comissao_seller_valor,
          o.frete,
          o.tipo_envio
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE ${where}
          AND o.company_id = $${params.length + 1}::uuid
          AND o.origem = 'mercado_livre'::order_origem
          AND o.status != 'cancelado'
      )
      SELECT
        COUNT(*)::int as pedidos,
        COALESCE(SUM(quantidade), 0)::int as unidades,
        COALESCE(SUM(preco_unitario * quantidade), 0)::float as receita_bruta,
        COALESCE(SUM(recebimento_liquido), 0)::float as recebimento,
        COALESCE(SUM(comissao_seller_valor), 0)::float as comissao,
        COALESCE(SUM(frete), 0)::float as frete,
        COALESCE(SUM(preco_unitario * quantidade - $${params.length + 2}::numeric * quantidade), 0)::float as lucro_antes_ml,
        COALESCE(SUM(recebimento_liquido - $${params.length + 2}::numeric * quantidade), 0)::float as lucro_liquido_ml
      FROM vendas
    `, ...params, LIURA_COMPANY, custo)

    // Por SKU (pra ver qual versão vendeu mais)
    const porSku: any[] = await prisma.$queryRawUnsafe(`
      WITH vendas AS (
        SELECT
          oi.sku,
          oi.quantidade,
          oi.preco_unitario,
          oi.nome_produto,
          o.recebimento_liquido
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE ${where}
          AND o.company_id = $${params.length + 1}::uuid
          AND o.origem = 'mercado_livre'::order_origem
          AND o.status != 'cancelado'
      )
      SELECT
        sku,
        MAX(nome_produto) as nome,
        COUNT(*)::int as pedidos,
        SUM(quantidade)::int as unidades,
        SUM(preco_unitario * quantidade)::float as receita,
        SUM(recebimento_liquido)::float as recebimento,
        SUM(preco_unitario * quantidade - $${params.length + 2}::numeric * quantidade)::float as lucro_antes_ml,
        SUM(recebimento_liquido - $${params.length + 2}::numeric * quantidade)::float as lucro_liquido_ml
      FROM vendas
      GROUP BY sku
      ORDER BY unidades DESC
    `, ...params, LIURA_COMPANY, custo)

    const r = resumo[0] || {}
    const cmv = custo * (r.unidades || 0)
    const lucroAntesML = (r.receita_bruta || 0) - cmv
    const lucroLiquido = (r.recebimento || 0) - cmv
    const margemPct = cmv > 0 ? Math.round((lucroLiquido / cmv) * 10000) / 100 : 0

    return NextResponse.json({
      ok: true,
      busca: q,
      custo_unitario: custo,
      resumo: {
        pedidos: r.pedidos || 0,
        unidades: r.unidades || 0,
        receita_bruta: r.receita_bruta || 0,
        comissao_ml: r.comissao || 0,
        frete_ml: r.frete || 0,
        recebimento: r.recebimento || 0,
        cmv_total: cmv,
        lucro_antes_ml: lucroAntesML,  // receita - CMV
        lucro_liquido_ml: lucroLiquido, // recebimento - CMV
        margem_liquida_pct: margemPct,
        margem_bruta_pct: cmv > 0 ? Math.round((lucroAntesML / cmv) * 10000) / 100 : 0,
        preco_medio_un: r.unidades > 0 ? Math.round((r.receita_bruta / r.unidades) * 100) / 100 : 0,
      },
      por_sku: porSku,
      observacao: 'Lucro = venda - custo (R$ 179/un). "Antes do ML" desconta só o custo. "Líquido ML" desconta custo + comissão + frete (é o que sobra no bolso).',
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message, stack: err.stack?.substring(0, 500) }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}
