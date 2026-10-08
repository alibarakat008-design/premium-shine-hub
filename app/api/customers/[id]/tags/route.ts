/**
 * API: Tags do cliente
 * POST /api/customers/[id]/tags
 *   Body: { tag, cor? }
 * DELETE /api/customers/[id]/tags?tagId=xxx
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await request.json()
    const { tag, cor } = body
    if (!tag) return NextResponse.json({ success: false, error: 'Tag obrigatória' }, { status: 400 })

    const created = await prisma.customer_tags.create({
      data: { customer_id: params.id, tag, cor: cor || '#a78bfa' },
    })
    return NextResponse.json({ success: true, data: created })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { searchParams } = new URL(request.url)
    const tagId = searchParams.get('tagId')
    if (!tagId) return NextResponse.json({ success: false, error: 'tagId obrigatório' }, { status: 400 })
    await prisma.customer_tags.delete({ where: { id: tagId } })
    return NextResponse.json({ success: true, message: 'Tag removida' })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
