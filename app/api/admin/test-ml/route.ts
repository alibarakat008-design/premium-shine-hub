/**
 * GET /api/admin/test-ml
 * Endpoint de diagnóstico: confirma se existe alguma conta ML conectada.
 *
 * Reescrito em 2026-09-01: a versão antiga não exigia NENHUMA autenticação e
 * devolvia o access_token real de uma conta ML em texto puro na resposta —
 * ou seja, qualquer pessoa que descobrisse essa URL conseguia um token ML
 * válido. Também tinha um Personal Access Token do Supabase gravado direto
 * no código (mesmo token exposto em outros arquivos — removido de todos,
 * recomendado revogar no painel do Supabase e gerar um novo). Agora exige
 * login da matriz e nunca devolve o token, só se ele existe.
 */
import { NextRequest, NextResponse } from 'next/server'
import { isMatrizRequest } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  if (!isMatrizRequest(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const account = await prisma.marketplace_accounts.findFirst({
      where: { plataforma: 'mercado_livre' },
      select: { id: true, nickname: true, access_token: true },
    })

    if (!account) {
      return NextResponse.json({ ok: true, count: 0, first: null })
    }

    return NextResponse.json({
      ok: true,
      count: 1,
      first: {
        id: account.id,
        nickname: account.nickname,
        has_access_token: !!account.access_token,
      },
    })
  } catch (err: any) {
    console.error('[test-ml] Error:', err)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}
