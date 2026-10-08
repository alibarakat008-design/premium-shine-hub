/**
 * GET /api/admin/rentabilidade
 *
 * Multi-tenant: filtra por company_id do cookie.
 *
 * 2 modos:
 *   - ?mes=YYYY-MM  → agrega vendas por DIA do mês (calendário)
 *   - ?data=YYYY-MM-DD → retorna vendas DETALHADAS desse dia (drill-down)
 *
 * Cálculo:
 *   faturamento = SUM(orders.total)
 *   recebimento = SUM(orders.recebimento_liquido)
 *   cmv = SUM(order_items.custo_unitario * order_items.quantidade)
 *   lucro = recebimento - cmv
 *   margem_pct = (lucro / faturamento) * 100
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifySessionToken, getCookieName } from '@/lib/auth-parceiro'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

function getCompanyIdFromCookie(req: NextRequest): string | null {
  // 1) Parceiro logado via token (vem a company dele)
  const token = req.cookies.get(getCookieName())?.value
  if (token) {
    const session = verifySessionToken(token)
    if (session) return session.companyId
  }
  // 2) Matriz/filial: psh_session_company tem a LIURAESSENCE (ou company ativa)
  const active = req.cookies.get('psh_session_company')?.value
  return active || null
}

export async function GET(req: NextRequest) {
  const companyId = getCompanyIdFromCookie(req)
  if (!companyId) {
    return NextResponse.json({ ok: false, error: 'Não logado' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const mes = searchParams.get('mes')   // YYYY-MM
  const data = searchParams.get('data') // YYYY-MM-DD

  try {
    if (data) {
      return await getDay(companyId, data)
    } else {
      return await getMonth(companyId, mes)
    }
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}

/** Agrega por dia do mês (calendário) */
async function getMonth(companyId: string, mes: string | null) {
  // Default: mês atual
  const now = new Date()
  let year = now.getUTCFullYear()
  let month = now.getUTCMonth() + 1
  if (mes && /^\d{4}-\d{2}$/.test(mes)) {
    year = Number(mes.split('-')[0])
    month = Number(mes.split('-')[1])
  }

  const inicio = new Date(Date.UTC(year, month - 1, 1))
  const fim = new Date(Date.UTC(year, month, 1)) // exclusive

  // Agrega por dia
  const rows: any[] = await prisma.$queryRawUnsafe(`
    SELECT
      DATE(o.created_at) AS dia,
      COUNT(DISTINCT o.id)::int AS vendas_count,
      COALESCE(SUM(o.total), 0)::float AS faturamento,
      COALESCE(SUM(o.recebimento_liquido), 0)::float AS recebimento,
      COALESCE(SUM(oi.custo_total), 0)::float AS cmv
    FROM orders o
    LEFT JOIN (
      SELECT order_id, SUM(custo_unitario * quantidade)::float AS custo_total
      FROM order_items
      GROUP BY order_id
    ) oi ON oi.order_id = o.id
    WHERE o.company_id = $1::uuid
      AND o.created_at >= $2
      AND o.created_at < $3
    GROUP BY DATE(o.created_at)
    ORDER BY dia
  `, companyId, inicio, fim)

  const diasMap = new Map<string, any>()
  for (const r of rows) {
    const dia = (r.dia instanceof Date ? r.dia.toISOString() : String(r.dia)).slice(0, 10)
    const lucro = Number(r.recebimento) - Number(r.cmv)
    const margem = Number(r.faturamento) > 0 ? (lucro / Number(r.faturamento)) * 100 : 0
    diasMap.set(dia, {
      date: dia,
      vendas_count: r.vendas_count,
      faturamento: Number(r.faturamento),
      recebimento: Number(r.recebimento),
      cmv: Number(r.cmv),
      lucro,
      margem_pct: Math.round(margem * 100) / 100,
    })
  }

  // Gera array com TODOS os dias do mês (preenche ausentes com zeros)
  const dias: any[] = []
  const daysInMonth = new Date(year, month, 0).getDate()
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    if (diasMap.has(dateStr)) {
      dias.push(diasMap.get(dateStr))
    } else {
      dias.push({
        date: dateStr,
        vendas_count: 0,
        faturamento: 0,
        recebimento: 0,
        cmv: 0,
        lucro: 0,
        margem_pct: 0,
      })
    }
  }

  // Totais do mês
  const totais = dias.reduce(
    (acc, d) => ({
      faturamento: acc.faturamento + d.faturamento,
      recebimento: acc.recebimento + d.recebimento,
      cmv: acc.cmv + d.cmv,
      lucro: acc.lucro + d.lucro,
      vendas_count: acc.vendas_count + d.vendas_count,
    }),
    { faturamento: 0, recebimento: 0, cmv: 0, lucro: 0, vendas_count: 0 },
  )
  totais.margem_pct = totais.faturamento > 0 ? Math.round((totais.lucro / totais.faturamento) * 10000) / 100 : 0

  return NextResponse.json({
    ok: true,
    mode: 'month',
    mes: `${year}-${String(month).padStart(2, '0')}`,
    company_id: companyId,
    dias,
    totais,
  })
}

/** Retorna vendas detalhadas de um dia específico (drill-down) */
async function getDay(companyId: string, data: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return NextResponse.json({ ok: false, error: 'data deve ser YYYY-MM-DD' }, { status: 400 })
  }
  const inicio = new Date(data + 'T00:00:00.000Z')
  const fim = new Date(inicio.getTime() + 24 * 60 * 60 * 1000)

  // Vendas do dia
  const vendas: any[] = await prisma.$queryRawUnsafe(`
    SELECT
      o.id::text AS id,
      o.order_number,
      o.status::text AS status,
      o.total::float AS total,
      o.recebimento_liquido::float AS recebimento,
      o.comissao_seller_valor::float AS comissao,
      o.frete::float AS frete,
      o.tipo_envio,
      o.created_at
    FROM orders o
    WHERE o.company_id = $1::uuid
      AND o.created_at >= $2
      AND o.created_at < $3
    ORDER BY o.created_at DESC
  `, companyId, inicio, fim)

  // Items por venda
  const orderIds = vendas.map(v => v.id)
  let items: any[] = []
  if (orderIds.length > 0) {
    items = await prisma.$queryRawUnsafe(`
      SELECT
        order_id::text AS order_id,
        sku,
        nome_produto,
        quantidade,
        preco_unitario::float AS preco_unitario,
        preco_total::float AS preco_total,
        custo_unitario::float AS custo_unitario,
        foto_url
      FROM order_items
      WHERE order_id = ANY($1::uuid[])
    `, orderIds)
  }

  const itemsByOrder = new Map<string, any[]>()
  for (const it of items) {
    if (!itemsByOrder.has(it.order_id)) itemsByOrder.set(it.order_id, [])
    itemsByOrder.get(it.order_id)!.push({
      sku: it.sku,
      nome: it.nome_produto,
      foto: it.foto_url,
      quantidade: Number(it.quantidade),
      preco_unitario: Number(it.preco_unitario),
      preco_total: Number(it.preco_total),
      custo_unitario: Number(it.custo_unitario),
      custo_total: Number(it.custo_unitario) * Number(it.quantidade),
      lucro_item: Number(it.preco_total) - Number(it.custo_unitario) * Number(it.quantidade),
    })
  }

  // Monta resposta com items
  const vendasDetalhadas = vendas.map(v => {
    const its = itemsByOrder.get(v.id) || []
    const cmv = its.reduce((acc, i) => acc + i.custo_total, 0)
    const lucro = Number(v.recebimento) - cmv
    return {
      id: v.id,
      order_number: v.order_number,
      status: v.status,
      tipo_envio: v.tipo_envio,
      total: Number(v.total),
      comissao: Number(v.comissao),
      frete: Number(v.frete),
      recebimento: Number(v.recebimento),
      cmv,
      lucro,
      margem_pct: Number(v.total) > 0 ? Math.round((lucro / Number(v.total)) * 10000) / 100 : 0,
      created_at: v.created_at,
      items: its,
    }
  })

  // Totais do dia
  const totais = vendasDetalhadas.reduce(
    (acc, v) => ({
      faturamento: acc.faturamento + v.total,
      recebimento: acc.recebimento + v.recebimento,
      cmv: acc.cmv + v.cmv,
      lucro: acc.lucro + v.lucro,
      vendas_count: acc.vendas_count + 1,
      items_count: acc.items_count + v.items.length,
    }),
    { faturamento: 0, recebimento: 0, cmv: 0, lucro: 0, vendas_count: 0, items_count: 0, margem_pct: 0 } as any,
  )
  ;(totais as any).margem_pct = totais.faturamento > 0 ? Math.round((totais.lucro / totais.faturamento) * 10000) / 100 : 0

  return NextResponse.json({
    ok: true,
    mode: 'day',
    date: data,
    company_id: companyId,
    vendas: vendasDetalhadas,
    totais,
  })
}