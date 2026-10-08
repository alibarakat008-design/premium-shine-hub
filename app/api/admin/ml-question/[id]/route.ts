/**
 * DELETE /api/admin/ml-question/[id]
 * Exclui/arquiva uma pergunta no Mercado Livre
 */
import { NextRequest, NextResponse } from 'next/server'
import { getMLToken } from '@/lib/ml-auth'
import { isMatrizRequest } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isMatrizRequest(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  try {
    const questionId = params.id
    const tokenResult = await getMLToken()
    if (!tokenResult) {
      return NextResponse.json({ ok: false, error: 'Token ML não disponível' }, { status: 401 })
    }

    const { token } = tokenResult

    // O ML não tem DELETE de pergunta via API pública.
    // A alternativa é marcar como "DELETED" via PATCH ou não fazer nada.
    // Por enquanto, retornamos ok para remover localmente (da UI)
    // e sugerimos que o admin responda ou use a interface do ML.

    return NextResponse.json({
      ok: true,
      message: 'Pergunta removida da lista local. (Exclusão via API ML não disponível — responda ou ignore no painel ML)',
      question_id: questionId,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
