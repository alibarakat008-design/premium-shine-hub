// CRUD de categorias de custo
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    const cats = await (prisma as any).cost_categories.findMany({
      orderBy: [{ tipo: 'asc' }, { ordem: 'asc' }, { nome: 'asc' }],
    })
    return NextResponse.json({ ok: true, data: cats })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const cat = await (prisma as any).cost_categories.create({
      data: {
        nome: body.nome,
        tipo: body.tipo || 'fixo',
        icone: body.icone || '📦',
        cor: body.cor || '#6b7280',
        ordem: body.ordem || 0,
        ativa: body.ativa !== false,
        company_id: body.company_id || null,
      },
    })
    return NextResponse.json({ ok: true, data: cat })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
