/**
 * API: Salários da Equipe
 * GET  /api/admin/equipe/salarios?equipe_id=X&mes=8&ano=2026
 * POST /api/admin/equipe/salarios — cria ou atualiza salário do mês
 */
import { NextRequest, NextResponse } from 'next/server'
import { isMatrizRequest } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!isMatrizRequest(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const { searchParams } = new URL(req.url)
    const equipe_id = searchParams.get('equipe_id')
    const mes = searchParams.get('mes')
    const ano = searchParams.get('ano')

    const where: any = {}
    if (equipe_id) where.equipe_id = equipe_id
    if (mes) where.mes = Number(mes)
    if (ano) where.ano = Number(ano)

    const salarios = await prisma.equipe_salarios.findMany({
      where,
      orderBy: [{ ano: 'desc' }, { mes: 'desc' }],
      include: { equipe: { select: { id: true, nome: true, foto_url: true } } },
    })

    return NextResponse.json({ ok: true, data: salarios })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  if (!isMatrizRequest(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const body = await req.json()
    const { equipe_id, mes, ano, salario_base, bonificacao, descontos, observacao, pago, pago_em } = body

    if (!equipe_id) return NextResponse.json({ ok: false, error: 'equipe_id obrigatório' }, { status: 400 })
    if (!mes || !ano) return NextResponse.json({ ok: false, error: 'mes e ano obrigatórios' }, { status: 400 })

    const base = Number(salario_base) || 0
    const bonus = Number(bonificacao) || 0
    const desc = Number(descontos) || 0
    const liquido = base + bonus - desc

    const salario = await prisma.equipe_salarios.upsert({
      where: { equipe_id_mes_ano: { equipe_id, mes: Number(mes), ano: Number(ano) } },
      create: {
        equipe_id,
        mes: Number(mes),
        ano: Number(ano),
        salario_base: base,
        bonificacao: bonus,
        descontos: desc,
        salario_liquido: liquido,
        observacao: observacao?.trim() || null,
        pago: pago || false,
        pago_em: pago_em ? new Date(pago_em) : null,
      },
      update: {
        salario_base: base,
        bonificacao: bonus,
        descontos: desc,
        salario_liquido: liquido,
        observacao: observacao?.trim() || null,
        pago: pago || false,
        pago_em: pago_em ? new Date(pago_em) : null,
        updated_at: new Date(),
      },
      include: { equipe: { select: { id: true, nome: true } } },
    })

    return NextResponse.json({ ok: true, data: salario })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
