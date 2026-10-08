/**
 * GET  /api/admin/ia-responses — lista respostas treinadas
 * POST /api/admin/ia-responses — cria/atualiza resposta treinada
 */
import { NextRequest, NextResponse } from 'next/server'
import { isMatrizRequest } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!isMatrizRequest(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  try {
    const { searchParams } = new URL(req.url)
    const category = searchParams.get('category')
    const catFilter = category ? `WHERE category = '${category.replace(/'/g, "''")}'` : ''
    const patterns = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM ia_training_responses ${catFilter} ORDER BY times_used DESC, created_at DESC`
    )
    return NextResponse.json({ ok: true, responses: patterns })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  if (!isMatrizRequest(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  try {
    const body = await req.json()
    const { question_pattern, trained_response, category, ml_response, shopee_response } = body

    if (!question_pattern?.trim() || !trained_response?.trim()) {
      return NextResponse.json({ ok: false, error: 'question_pattern e trained_response são obrigatórios' }, { status: 400 })
    }

    // Upsert — atualiza se existir, cria se não
    const qp = question_pattern.trim().replace(/'/g, "''")
    const tr = trained_response.trim().replace(/'/g, "''")
    const cat = (category || 'general').replace(/'/g, "''")
    const mlr = ml_response ? ml_response.replace(/'/g, "''") : null
    const shr = shopee_response ? shopee_response.replace(/'/g, "''") : null

    const existing = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id FROM ia_training_responses WHERE LOWER(question_pattern) = LOWER('${qp}') LIMIT 1`
    )

    if (existing.length > 0) {
      await prisma.$executeRawUnsafe(
        `UPDATE ia_training_responses SET trained_response = '${tr}', category = '${cat}', ml_response = ${mlr ? `'${mlr}'` : 'NULL'}, shopee_response = ${shr ? `'${shr}'` : 'NULL'}, updated_at = NOW() WHERE id = '${existing[0].id}'`
      )
    } else {
      await prisma.$executeRawUnsafe(
        `INSERT INTO ia_training_responses (question_pattern, trained_response, category, ml_response, shopee_response) VALUES ('${qp}', '${tr}', '${cat}', ${mlr ? `'${mlr}'` : 'NULL'}, ${shr ? `'${shr}'` : 'NULL'})`
      )
    }

    return NextResponse.json({ ok: true, message: 'Resposta treinada salva!' })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
