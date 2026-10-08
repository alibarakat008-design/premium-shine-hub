import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/empresas/[id]/set-ml-placeholder
 *
 * Marca a empresa como "tentou conectar ML mas não conseguiu"
 * pra desabilitar a UX de "conecte ML agora" e liberar o uso geral do painel.
 *
 * Só pra quando o user tá bloqueado de acessar auth.mercadolivre.com.br
 * (problema de DNS, rede, etc). Tokens REAL serão cadastrados depois
 * via /api/admin/empresas/[id]/token-ml (modo manual) ou OAuth.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = req.headers.get('authorization')
  if (auth !== `Basic ${Buffer.from('premium:shine2026').toString('base64')}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const nota = body.nota || 'Tentativa de OAuth bloqueada — aguardando reconexão manual'

    // Marca ml_expires_at como NULL e adiciona nota no nome se quiser
    await prisma.$queryRawUnsafe(`
      UPDATE companies SET
        ml_expires_at = NULL,
        access_token_ml = '__PENDING__',
        updated_at = NOW()
      WHERE id = $1::uuid
    `, params.id)

    // Salva a nota num campo JSON novo (não tem, vou usar nome_fantasia append)
    // Idealmente criar uma coluna `notes`, mas pra agora só logamos
    console.log(`[set-ml-placeholder] company=${params.id} nota=${nota}`)

    return NextResponse.json({
      ok: true,
      message: 'Marcado como pendente. Painel liberado pra uso sem ML.',
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}