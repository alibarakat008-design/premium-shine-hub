// CRUD de custos mensais (registros de gasto)
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { audit, auditFromRequest } from '@/lib/audit'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const ano = Number(searchParams.get('ano') || new Date().getFullYear())
    const mes = searchParams.get('mes') ? Number(searchParams.get('mes')) : null

    const where: any = { ano }
    if (mes) where.mes = mes

    const costs = await (prisma as any).monthly_costs.findMany({
      where,
      orderBy: [{ ano: 'desc' }, { mes: 'desc' }, { created_at: 'desc' }],
    })
    return NextResponse.json({ ok: true, data: costs })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    if (!body.category_id || !body.ano || !body.mes || !body.valor) {
      return NextResponse.json({ ok: false, error: 'category_id, ano, mes e valor são obrigatórios' }, { status: 400 })
    }
    // Buscar nome da categoria pra snapshot
    const cat = await (prisma as any).cost_categories.findUnique({ where: { id: body.category_id } })
    const cost = await (prisma as any).monthly_costs.create({
      data: {
        category_id: body.category_id,
        company_id: body.company_id || null,
        ano: body.ano,
        mes: body.mes,
        descricao: body.descricao || null,
        valor: body.valor,
        categoria_nome: cat?.nome || null,
        pago_em: body.pago_em ? new Date(body.pago_em) : null,
        observacoes: body.observacoes || null,
      },
    })
    const ctx = auditFromRequest(req)
    await audit({
      acao: 'cost.create',
      tabela: 'monthly_costs',
      registro_id: cost.id,
      dados_novos: { valor: Number(body.valor), categoria: cat?.nome, ano: body.ano, mes: body.mes, descricao: body.descricao },
      ...ctx,
    })
    return NextResponse.json({ ok: true, data: cost })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ ok: false, error: 'id é obrigatório' }, { status: 400 })
    const antigo = await (prisma as any).monthly_costs.findUnique({ where: { id } })
    await (prisma as any).monthly_costs.delete({ where: { id } })
    if (antigo) {
      const ctx = auditFromRequest(req)
      await audit({
        acao: 'cost.delete',
        tabela: 'monthly_costs',
        registro_id: id,
        dados_anteriores: { valor: Number(antigo.valor), categoria: antigo.categoria_nome, ano: antigo.ano, mes: antigo.mes, descricao: antigo.descricao },
        ...ctx,
      })
    }
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
