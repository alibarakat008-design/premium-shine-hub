/**
 * GET /api/admin/ia-responses/[id]
 * PUT /api/admin/ia-responses/[id]
 * DELETE /api/admin/ia-responses/[id]
 */
import { NextRequest, NextResponse } from 'next/server'
import { isMatrizRequest } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isMatrizRequest(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  try {
    const id = params.id.replace(/'/g, "''")
    const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM ia_training_responses WHERE id = '${id}' LIMIT 1`)
    if (!rows.length) return NextResponse.json({ ok: false, error: 'Não encontrado' }, { status: 404 })
    return NextResponse.json({ ok: true, response: rows[0] })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isMatrizRequest(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  try {
    const body = await req.json()
    const { trained_response, category, ml_response, shopee_response } = body
    const id = params.id.replace(/'/g, "''")
    const tr = (trained_response || '').replace(/'/g, "''")
    const cat = (category || 'general').replace(/'/g, "''")
    const mlr = ml_response ? `'${ml_response.replace(/'/g,"''")}'` : 'NULL'
    const shr = shopee_response ? `'${shopee_response.replace(/'/g,"''")}'` : 'NULL'
    await prisma.$executeRawUnsafe(
      `UPDATE ia_training_responses SET trained_response = '${tr}', category = '${cat}', ml_response = ${mlr}, shopee_response = ${shr}, updated_at = NOW() WHERE id = '${id}'`
    )
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isMatrizRequest(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  try {
    const id = params.id.replace(/'/g, "''")
    await prisma.$executeRawUnsafe(`DELETE FROM ia_training_responses WHERE id = '${id}'`)
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
