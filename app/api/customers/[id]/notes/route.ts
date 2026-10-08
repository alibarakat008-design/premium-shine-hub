/**
 * API: Notas do cliente
 * POST /api/customers/[id]/notes
 *   Body: { nota, autor? }
 * DELETE /api/customers/[id]/notes?noteId=xxx
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await request.json()
    const { nota, autor } = body
    if (!nota) return NextResponse.json({ success: false, error: 'Nota obrigatória' }, { status: 400 })

    const note = await prisma.customer_notes.create({
      data: { customer_id: params.id, nota, autor: autor || 'Sistema' },
    })
    return NextResponse.json({ success: true, data: note })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { searchParams } = new URL(request.url)
    const noteId = searchParams.get('noteId')
    if (!noteId) return NextResponse.json({ success: false, error: 'noteId obrigatório' }, { status: 400 })
    await prisma.customer_notes.delete({ where: { id: noteId } })
    return NextResponse.json({ success: true, message: 'Nota removida' })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
