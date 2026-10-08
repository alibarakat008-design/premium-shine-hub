/**
 * Lista total de vendas de um produto específico por nome (LIURA)
 * GET /api/admin/produto-vendas?q=ARMAF%20CLUB%20100ml
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
  const q = searchParams.get('q') || ''
  if (!q) return NextResponse.json({ ok: false, error: 'Passe ?q=NOME_DO_PRODUTO' }, { status: 400 })

  try {
    // Tenta match exato + variantes (case-insensitive, com 100ml/50ml etc)
    const termos = q.toLowerCase().split(/\s+/).filter(Boolean)
    const where = q
      .split(/\s+/)
      .map((t, i) => `oi.nome_produto ILIKE $${i + 1}`)
      .join(' AND ')
    const params = q.split(/\s+/).map(t => `%${t}%`)

    const vendas: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        oi.id::text as id,
        oi.nome_produto as produto,
        oi.sku,
        oi.quantidade as qtd,
        oi.preco_unitario::float as preco_unit,
        (oi.quantidade * oi.preco_unitario)::float as preco_total,
        oi.custo_unitario::float as custo_unit,
        o.status,
        o.order_number,
        o.pack_id,
        o.created_at,
        o.recebimento_liquido::float as recebimento_venda,
        o.tipo_envio
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE ${where}
        AND o.company_id = $${params.length + 1}::uuid
        AND o.origem = 'mercado_livre'::order_origem
        AND o.status != 'cancelado'
      ORDER BY o.created_at DESC
    `, ...params, LIURA_COMPANY)

    const total = vendas.reduce((s, v) => s + v.qtd, 0)
    const receita = vendas.reduce((s, v) => s + (v.preco_total || 0), 0)
    const recebimento = vendas.reduce((s, v) => s + (v.recebimento_venda || 0), 0)

    return NextResponse.json({
      ok: true,
      busca: q,
      total_pedidos: vendas.length,
      total_unidades: total,
      receita_bruta: receita,
      recebimento_total: recebimento,
      primeira_venda: vendas[vendas.length - 1]?.created_at,
      ultima_venda: vendas[0]?.created_at,
      vendas,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message, stack: err.stack?.substring(0, 500) }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}
