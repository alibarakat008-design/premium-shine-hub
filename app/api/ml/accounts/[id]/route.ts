/**
 * =====================================================
 * API DESCONECTAR CONTA ML
 * =====================================================
 * DELETE /api/ml/accounts/:id
 * =====================================================
 */

// app/api/ml/accounts/[id]/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function DELETE(

  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params

    const account = await prisma.marketplace_accounts.findUnique({
      where: { id },
    })

    if (!account) {
      return NextResponse.json(
        { success: false, error: 'Conta não encontrada' },
        { status: 404 }
      )
    }

    // Marcar como inativa ao invés de deletar (preserva histórico)
    await prisma.marketplace_accounts.update({
      where: { id },
      data: {
        ativa: false,
        access_token: '', // limpar tokens
        refresh_token: '',
        updated_at: new Date(),
      },
    })

    return NextResponse.json({
      success: true,
      message: 'Conta desconectada. Os listings foram preservados mas estão inativos.',
    })
  } catch (err: any) {
    console.error('[API ML Disconnect]', err)
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    )
  }
}
