// /api/admin/publish-produtos
// POST: publica (ou despublica) produtos no site
// Body: { product_ids: string[], publicado_site: boolean }
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isMatrizRequest } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  if (!isMatrizRequest(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const body = await req.json()
    const { product_ids, publicado_site = true } = body
    if (!Array.isArray(product_ids) || product_ids.length === 0) {
      return NextResponse.json({ ok: false, error: 'product_ids array required' }, { status: 400 })
    }
    const result = await prisma.products.updateMany({
      where: { id: { in: product_ids } },
      data: { publicado_site },
    })
    return NextResponse.json({ ok: true, updated: result.count })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
