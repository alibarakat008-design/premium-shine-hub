// GET/POST /api/admin/monthly-goals
// GET: retorna meta + progresso do mês atual
// POST: cria/atualiza meta

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const now = new Date()
    const ano = Number(searchParams.get('ano') || now.getFullYear())
    const mes = Number(searchParams.get('mes') || now.getMonth() + 1)

    const company = await prisma.companies.findFirst({ where: { ativa: true } })

    const goal = await (prisma as any).monthly_goals.findUnique({
      where: { company_id_ano_mes: { company_id: company?.id || null, ano, mes } },
    })

    // Calcular realizado
    const inicioMes = new Date(ano, mes - 1, 1)
    const fimMes = new Date(ano, mes, 1)
    const orders = await prisma.orders.findMany({
      where: {
        created_at: { gte: inicioMes, lt: fimMes },
        status: { notIn: ['cancelado', 'devolvido'] },
      },
      select: { id: true, total: true },
    })
    const ordersCount = orders.length
    const receita = orders.reduce((s, o) => s + Number(o.total || 0), 0)

    // Custo total do mês
    const items = await prisma.order_items.findMany({
      where: {
        orders: {
          created_at: { gte: inicioMes, lt: fimMes },
          status: { notIn: ['cancelado', 'devolvido'] },
        },
      },
      select: {
        quantidade: true,
        products: {
          select: {
            product_prices: { where: { canal: 'mercado_livre' }, select: { custo: true }, take: 1 },
          },
        },
      },
    })
    const cmv = items.reduce((s, i) => {
      const c = i.products?.product_prices?.[0]?.custo ? Number(i.products.product_prices[0].custo) : 0
      return s + c * (i.quantidade || 1)
    }, 0)

    // Comissões (média ponderada: 17% Full + 14% Agência + 13% Clássico + 14% Shopee + 4% site)
    // Usa 14% como fallback padrão; pra precisão real use a API de lucro-real
    const comissao = receita * 0.14

    // Lucro bruto
    const lucroBruto = receita - cmv - comissao

    // Custos do mês
    const custos = await (prisma as any).monthly_costs.findMany({
      where: { ano, mes },
    })
    const totalCustosFixos = custos.reduce(
      (s: number, c: any) => s + (Number(c.valor) || 0),
      0
    )

    const lucroLiquido = lucroBruto - totalCustosFixos
    const margemPct = receita > 0 ? (lucroLiquido / receita) * 100 : 0

    return NextResponse.json({
      ok: true,
      goal,
      realizado: {
        pedidos: ordersCount,
        receita: Number(receita.toFixed(2)),
        cmv: Number(cmv.toFixed(2)),
        comissao: Number(comissao.toFixed(2)),
        custos_fixos: Number(totalCustosFixos.toFixed(2)),
        lucro_bruto: Number(lucroBruto.toFixed(2)),
        lucro_liquido: Number(lucroLiquido.toFixed(2)),
        margem_pct: Number(margemPct.toFixed(1)),
      },
      periodo: { ano, mes, dias_no_mes: new Date(ano, mes, 0).getDate(), dia_atual: now.getDate() },
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { ano, mes, meta_receita, meta_pedidos, meta_margem_pct, observacoes } = body

    if (!ano || !mes) {
      return NextResponse.json({ ok: false, error: 'ano e mes são obrigatórios' }, { status: 400 })
    }

    const company = await prisma.companies.findFirst({ where: { ativa: true } })

    // Upsert via SQL (não há unique no schema prisma pra esta tabela)
    const data = {
      company_id: company?.id || null,
      ano,
      mes,
      meta_receita: Number(meta_receita || 0),
      meta_pedidos: Number(meta_pedidos || 0),
      meta_margem_pct: Number(meta_margem_pct || 0),
      observacoes: observacoes || null,
      updated_at: new Date(),
    }

    // Tenta update, senão insert
    const existing = await (prisma as any).monthly_goals.findFirst({
      where: { company_id: company?.id || null, ano, mes },
    })
    if (existing) {
      await (prisma as any).monthly_goals.update({
        where: { id: existing.id },
        data,
      })
    } else {
      await (prisma as any).monthly_goals.create({ data: { ...data, created_at: new Date() } })
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
