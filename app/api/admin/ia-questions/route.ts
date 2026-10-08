/**
 * GET /api/admin/ia-questions
 * Filtra perguntas de ML e Shopee
 * ML: puxa do endpoint /api/admin/ml-questions (real)
 * Shopee: dados simulados (precisa da extensão Shopee)
 * Fallback: dados demo se não tiver token
 */
import { NextRequest, NextResponse } from 'next/server'
import { getMLToken } from '@/lib/ml-auth'
import { isMatrizRequest } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

const DEMO_ML = [
  { id: 'q1', texto: 'Esse perfume é original? Posso confiar na originalidade?', marketplace: 'ML', created_at: new Date(Date.now() - 2*3600000).toISOString(), status: 'UNANSWERED' },
  { id: 'q2', texto: 'Faz entrega para meu CEP? Qual o prazo?', marketplace: 'ML', created_at: new Date(Date.now() - 5*3600000).toISOString(), status: 'UNANSWERED' },
  { id: 'q3', texto: 'Qual a concentração do perfume? Eau de Parfum ou de Toilette?', marketplace: 'ML', created_at: new Date(Date.now() - 8*3600000).toISOString(), status: 'UNANSWERED' },
  { id: 'q4', texto: 'Tem a versão desse perfume em 100ml?', marketplace: 'ML', created_at: new Date(Date.now() - 86400000).toISOString(), status: 'UNANSWERED' },
  { id: 'q5', texto: 'Posso devolver se não gostar?', marketplace: 'ML', created_at: new Date(Date.now() - 27*3600000).toISOString(), status: 'UNANSWERED' },
  { id: 'q6', texto: 'Esse aroma dura quanto tempo na pele?', marketplace: 'ML', created_at: new Date(Date.now() - 2*86400000).toISOString(), status: 'UNANSWERED' },
  { id: 'q7', texto: 'Quais são as notas olfativas?', marketplace: 'ML', created_at: new Date(Date.now() - 3*86400000).toISOString(), status: 'UNANSWERED' },
  { id: 'q8', texto: 'Embalado para presente?', marketplace: 'ML', created_at: new Date(Date.now() - 4*86400000).toISOString(), status: 'UNANSWERED' },
]
const DEMO_SHOPEE = [
  { id: 's1', texto: 'O produto é igual as fotos?', marketplace: 'Shopee', created_at: new Date(Date.now() - 1*3600000).toISOString(), status: 'UNANSWERED' },
  { id: 's2', texto: 'Quanto tempo para chegar em SP?', marketplace: 'Shopee', created_at: new Date(Date.now() - 4*3600000).toISOString(), status: 'UNANSWERED' },
  { id: 's3', texto: 'Tem desconto para compra acima de 3 unidades?', marketplace: 'Shopee', created_at: new Date(Date.now() - 6*3600000).toISOString(), status: 'UNANSWERED' },
  { id: 's4', texto: 'Embalado para presente?', marketplace: 'Shopee', created_at: new Date(Date.now() - 26*3600000).toISOString(), status: 'UNANSWERED' },
  { id: 's5', texto: 'Posso combinar o valor com o vendedor?', marketplace: 'Shopee', created_at: new Date(Date.now() - 29*3600000).toISOString(), status: 'UNANSWERED' },
  { id: 's6', texto: 'Esse corpo tem álcool? Qual a composição?', marketplace: 'Shopee', created_at: new Date(Date.now() - 2*86400000).toISOString(), status: 'UNANSWERED' },
  { id: 's7', texto: 'Vem com nota fiscal?', marketplace: 'Shopee', created_at: new Date(Date.now() - 3*86400000).toISOString(), status: 'UNANSWERED' },
]

async function fetchMLQuestions(token: string, limit: number) {
  // Primeiro busca o user_id numérico do ML
  const meRes = await fetch('https://api.mercadolibre.com/users/me', {
    headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
  })
  if (!meRes.ok) return null
  const meData = await meRes.json()
  const userId = meData.id

  const mlRes = await fetch(
    `https://api.mercadolibre.com/questions/search?seller_id=${userId}&status=UNANSWERED&limit=${limit}`,
    { headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' } }
  )
  if (!mlRes.ok) return null
  const data = await mlRes.json()
  return (data.questions || []).map((q: any) => ({
    id: String(q.id),
    texto: q.text,
    marketplace: 'ML',
    created_at: q.date_created,
    status: q.answer ? 'ANSWERED' : 'UNANSWERED',
    answer: q.answer?.text || null,
    ml_id: q.id,
    item_id: q.item_id,
    from_nickname: q.from?.nickname || 'Comprador',
  }))
}

export async function GET(req: NextRequest) {
  if (!isMatrizRequest(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  try {
    const { searchParams } = new URL(req.url)
    const marketplace = searchParams.get('marketplace') || 'all'
    const limit = parseInt(searchParams.get('limit') || '20')

    // Tenta buscar ML real
    let mlQuestions: any[] = []
    let mlReal = false
    const tokenResult = await getMLToken()
    if (tokenResult) {
      const real = await fetchMLQuestions(tokenResult.token, limit)
      if (real && real.length > 0) {
        mlQuestions = real
        mlReal = true
      }
    }
    // Fallback demo se não conseguiu ML real
    if (mlQuestions.length === 0) {
      mlQuestions = DEMO_ML.slice(0, limit)
    }

    const shopeeQuestions = DEMO_SHOPEE.slice(0, limit)

    let questions = [...mlQuestions, ...shopeeQuestions]
    if (marketplace === 'ML') questions = mlQuestions
    if (marketplace === 'Shopee') questions = shopeeQuestions

    questions.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    return NextResponse.json({
      ok: true,
      marketplace,
      ml_real: mlReal,
      counts: { ml: mlQuestions.length, shopee: shopeeQuestions.length, total: mlQuestions.length + shopeeQuestions.length },
      questions: questions.slice(0, limit),
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
