/**
 * API: Marcar alerta como lido/resolvido
 * PUT /api/alertas/[id]
 *   Body: { lido?, resolvido? }
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await request.json()
    const updated = await prisma.smart_alerts.update({
      where: { id: params.id },
      data: { lido: body.lido, resolvido: body.resolvido },
    })
    return NextResponse.json({ success: true, data: updated })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
