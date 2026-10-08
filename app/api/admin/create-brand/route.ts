// /api/admin/create-brand
// POST: cria uma marca nova
// Body: { nome: string }
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isMatrizRequest } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  if (!isMatrizRequest(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const body = await req.json()
    const { nome } = body
    if (!nome || typeof nome !== 'string' || nome.trim().length === 0) {
      return NextResponse.json({ ok: false, error: 'nome obrigatório' }, { status: 400 })
    }
    const nomeTrim = nome.trim().toUpperCase()

    // Check if already exists
    const existing = await prisma.brands.findFirst({
      where: { nome: { equals: nomeTrim, mode: 'insensitive' } },
      select: { id: true, nome: true },
    })
    if (existing) {
      return NextResponse.json({ ok: true, brand: existing, created: false })
    }

    const brand = await prisma.brands.create({
      data: {
        nome: nomeTrim,
        ativa: true,
      },
      select: { id: true, nome: true },
    })
    return NextResponse.json({ ok: true, brand, created: true })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
