/**
 * API: Ponto — registro de entrada/saída
 * GET  /api/admin/equipe/ponto?equipe_id=X&data=YYYY-MM-DD
 * POST /api/admin/equipe/ponto — registra ponto
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
    const data = searchParams.get('data') // YYYY-MM-DD

    const where: any = {}
    if (equipe_id) where.equipe_id = equipe_id
    if (data) {
      const start = new Date(data + 'T00:00:00.000Z')
      const end = new Date(data + 'T23:59:59.999Z')
      where.data_hora = { gte: start, lte: end }
    }

    const pontos = await prisma.equipe_ponto.findMany({
      where,
      orderBy: { data_hora: 'asc' },
      include: { equipe: { select: { id: true, nome: true, foto_url: true } } },
    })

    return NextResponse.json({ ok: true, data: pontos })
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
    const { equipe_id, tipo, data_hora, foto_url, observacao, registrado_por } = body

    if (!equipe_id) return NextResponse.json({ ok: false, error: 'equipe_id obrigatório' }, { status: 400 })

    const tipoVal = tipo || 'entrada'
    const horario = data_hora ? new Date(data_hora) : new Date()

    const ponto = await prisma.equipe_ponto.create({
      data: {
        equipe_id,
        tipo: tipoVal,
        data_hora: horario,
        foto_url: foto_url || null,
        observacao: observacao?.trim() || null,
        registrado_por: registrado_por || null,
      },
      include: { equipe: { select: { id: true, nome: true } } },
    })

    return NextResponse.json({ ok: true, data: ponto })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
