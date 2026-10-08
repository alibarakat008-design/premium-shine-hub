/**
 * API: Pagamentos avulsos da Equipe
 * GET  /api/admin/equipe/pagamentos?equipe_id=X&mes=8&ano=2026
 * POST /api/admin/equipe/pagamentos — registra pagamento avulso
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
    if (mes) where.referencia_mes = Number(mes)
    if (ano) where.referencia_ano = Number(ano)

    const pagamentos = await prisma.equipe_pagamentos.findMany({
      where,
      orderBy: { data_pagamento: 'desc' },
      include: { equipe: { select: { id: true, nome: true, foto_url: true } } },
    })

    return NextResponse.json({ ok: true, data: pagamentos })
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
    const { equipe_id, tipo, valor, data_pagamento, referencia_mes, referencia_ano, observacao, registrado_por } = body

    if (!equipe_id) return NextResponse.json({ ok: false, error: 'equipe_id obrigatório' }, { status: 400 })
    if (!valor || Number(valor) <= 0) return NextResponse.json({ ok: false, error: 'valor obrigatório' }, { status: 400 })
    if (!data_pagamento) return NextResponse.json({ ok: false, error: 'data_pagamento obrigatório' }, { status: 400 })

    const validTipos = ['salario', 'vale', 'bonus', 'decimo_terceiro', 'ferias', 'outro']
    const tipoVal = validTipos.includes(tipo) ? tipo : 'vale'

    const pgto = await prisma.equipe_pagamentos.create({
      data: {
        equipe_id,
        tipo: tipoVal as any,
        valor: Number(valor),
        data_pagamento: new Date(data_pagamento),
        referencia_mes: referencia_mes ? Number(referencia_mes) : null,
        referencia_ano: referencia_ano ? Number(referencia_ano) : null,
        observacao: observacao?.trim() || null,
        registrado_por: registrado_por || null,
      },
      include: { equipe: { select: { id: true, nome: true } } },
    })

    return NextResponse.json({ ok: true, data: pgto })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  if (!isMatrizRequest(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ ok: false, error: 'ID obrigatório' }, { status: 400 })

    await prisma.equipe_pagamentos.delete({ where: { id } })
    return NextResponse.json({ ok: true, message: 'Removido' })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
