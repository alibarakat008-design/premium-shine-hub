/**
 * GET /api/admin/ml-questions
 * Puxa perguntas REAIS da conta LIURA do Mercado Livre
 * Usa getMLToken() com auto-refresh
 */
import { NextRequest, NextResponse } from 'next/server'
import { getMLToken } from '@/lib/ml-auth'
import { isMatrizRequest } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

interface MLQuestion {
  id: number
  text: string
  status: string
  answer?: { text: string; status: string }
  date_created: string
  from: { id: number; nickname: string }
  item_id: string
}

interface MLQuestionsResponse {
  total: number
  questions: MLQuestion[]
}

interface MLItemInfo {
  id: string
  title: string
  price: number
  thumbnail: string
  permalink: string
}

export async function GET(req: NextRequest) {
  if (!isMatrizRequest(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  try {
    const { searchParams } = new URL(req.url)
    const limit = parseInt(searchParams.get('limit') || '50')
    const status = searchParams.get('status') || 'UNANSWERED' // UNANSWERED, ANSWERED, ALL

    const tokenResult = await getMLToken()

    if (!tokenResult) {
      return NextResponse.json({
        ok: false,
        error: 'Token ML não disponível. Verifique se a conta LIURA está conectada em Configurações > Mercado Livre.',
        demo: true,
      })
    }

    const { token } = tokenResult

    // Primeiro busca o user_id numérico
    const meRes = await fetch('https://api.mercadolibre.com/users/me', {
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
    })
    if (!meRes.ok) {
      return NextResponse.json({ ok: false, error: 'Não foi possível identificar o usuário ML', demo: true })
    }
    const meData = await meRes.json()
    const userId = meData.id

    // Fetch questions from ML
    const mlUrl = `https://api.mercadolibre.com/questions/search?seller_id=${userId}&status=${status}&limit=${limit}`

    const mlRes = await fetch(mlUrl, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
    })

    if (!mlRes.ok) {
      const errText = await mlRes.text()
      console.error('[ml-questions] ML API error:', errText)
      return NextResponse.json({
        ok: false,
        error: `Erro ML: ${mlRes.status} - ${errText}`,
        demo: true,
      })
    }

    const data: MLQuestionsResponse = await mlRes.json()

    // Para cada pergunta, buscar info do item
    const questionsWithItems = await Promise.allSettled(
      (data.questions || []).slice(0, limit).map(async (q: MLQuestion) => {
        try {
          const itemRes = await fetch(`https://api.mercadolibre.com/items/${q.item_id}`, {
            headers: { 'Authorization': `Bearer ${token}` },
          })
          if (!itemRes.ok) return { question: q, item: null }
          const item: MLItemInfo = await itemRes.json()
          return {
            question: q,
            item: {
              id: item.id,
              title: item.title,
              thumbnail: item.thumbnail,
              permalink: item.permalink,
              price: item.price,
            },
          }
        } catch {
          return { question: q, item: null }
        }
      })
    )

    const results = questionsWithItems
      .filter(r => r.status === 'fulfilled')
      .map(r => (r as PromiseFulfilledResult<any>).value)

    return NextResponse.json({
      ok: true,
      marketplace: 'ML',
      total: data.total || results.length,
      counts: {
        ml: results.length,
        shopee: 0,
        total: results.length,
      },
      questions: results.map(({ question: q, item }) => ({
        id: String(q.id),
        texto: q.text,
        marketplace: 'ML',
        created_at: q.date_created,
        status: q.answer ? 'ANSWERED' : 'UNANSWERED',
        answer: q.answer?.text || null,
        ml_id: q.id,
        item_id: q.item_id,
        from_nickname: q.from?.nickname || 'Comprador',
        item: item ? {
          id: item.id,
          title: item.title,
          thumbnail: item.thumbnail,
          permalink: item.permalink,
        } : null,
      })),
    })
  } catch (err: any) {
    console.error('[ml-questions] Error:', err)
    return NextResponse.json({
      ok: false,
      error: err.message || 'Erro interno',
      demo: true,
    })
  }
}
