import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || ''
  if (!authHeader.startsWith('Basic ')) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const suppliers: any = await prisma.suppliers.findMany({ orderBy: { nome: 'asc' } })
    return NextResponse.json({ ok: true, suppliers })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || ''
  if (!authHeader.startsWith('Basic ')) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const body = await req.json()
    const { nome, cnpj, contato_nome, contato_telefone, contato_email, prazo_entrega_dias, pedido_minimo_valor } = body
    if (!nome) return NextResponse.json({ ok: false, error: 'nome obrigatório' }, { status: 400 })

    const res: any = await prisma.$queryRawUnsafe(`
      INSERT INTO suppliers (nome, cnpj, contato_nome, contato_telefone, contato_email, prazo_entrega_dias, pedido_minimo_valor, ativo, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, true, NOW())
      RETURNING *
    `, nome, cnpj || null, contato_nome || null, contato_telefone || null, contato_email || null, prazo_entrega_dias || null, pedido_minimo_valor || null)
    return NextResponse.json({ ok: true, supplier: res[0] })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}