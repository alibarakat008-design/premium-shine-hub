import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// PUT: editar empresa existente
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = req.headers.get('authorization')
  if (auth !== `Basic ${Buffer.from('premium:shine2026').toString('base64')}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { razao_social, nome_fantasia, email, account_type, ativa } = body

    await prisma.$queryRawUnsafe(`
      UPDATE companies SET
        razao_social = COALESCE($2, razao_social),
        nome_fantasia = $3,
        email = $4,
        account_type = COALESCE($5, account_type),
        ativa = COALESCE($6, ativa),
        updated_at = NOW()
      WHERE id = $1::uuid
    `, params.id, razao_social, nome_fantasia, email, account_type, ativa)

    return NextResponse.json({ ok: true, message: 'Empresa atualizada' })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}

// DELETE: desativar (soft) — apenas marca como ativa=false
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = req.headers.get('authorization')
  if (auth !== `Basic ${Buffer.from('premium:shine2026').toString('base64')}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    await prisma.$queryRawUnsafe(`UPDATE companies SET ativa = false, updated_at = NOW() WHERE id = $1::uuid`, params.id)
    return NextResponse.json({ ok: true, message: 'Empresa desativada' })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}