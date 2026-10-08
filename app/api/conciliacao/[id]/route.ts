/**
 * API: Match manual de uma transação
 * PUT /api/conciliacao/[id]
 *   Body: { matched_with, matched_id?, confianca? }
 * DELETE /api/conciliacao/[id]
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await request.json()
    const updated = await prisma.bank_statements.update({
      where: { id: params.id },
      data: {
        matched_with: body.matched_with || null,
        matched_id: body.matched_id || null,
        confianca: body.confianca || 100,
      },
    })
    return NextResponse.json({ success: true, data: updated })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await prisma.bank_statements.delete({ where: { id: params.id } })
    return NextResponse.json({ success: true, message: 'Removido' })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
