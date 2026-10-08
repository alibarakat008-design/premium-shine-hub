/**
 * POST /api/admin/ml-answer
 * Envia uma resposta para uma pergunta no Mercado Livre
 * Body: { question_id, text }
 */
import { NextRequest, NextResponse } from 'next/server'
import { getMLToken } from '@/lib/ml-auth'
import { isMatrizRequest } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  if (!isMatrizRequest(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    const { question_id, text } = body

    if (!question_id || !text?.trim()) {
      return NextResponse.json({ ok: false, error: 'question_id e text são obrigatórios' }, { status: 400 })
    }

    const tokenResult = await getMLToken()
    if (!tokenResult) {
      return NextResponse.json({ ok: false, error: 'Token ML não disponível. Reconecte a conta.' }, { status: 401 })
    }

    const { token } = tokenResult

    // POST resposta no ML
    const mlRes = await fetch(`https://api.mercadolibre.com/questions/${question_id}/answers`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ question_id: String(question_id), text: text.trim() }),
    })

    if (!mlRes.ok) {
      const errText = await mlRes.text()
      console.error('[ml-answer] Error:', errText)
      return NextResponse.json({
        ok: false,
        error: `Erro ML: ${mlRes.status} - ${errText}`,
      }, { status: 500 })
    }

    const data = await mlRes.json()
    return NextResponse.json({
      ok: true,
      message: 'Resposta enviada com sucesso!',
      answer_id: data.id,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
