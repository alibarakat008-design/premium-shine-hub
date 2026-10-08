/**
 * API: Toggle publicar/despublicar produto no site
 * POST /api/site/toggle
 *   Body: { product_id, publicado, url? }
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { product_id, publicado, url } = body

    if (!product_id) return NextResponse.json({ success: false, error: 'product_id obrigatório' }, { status: 400 })

    const slug = url || `https://cosmari.com.br/produto/${product_id}`

    const product = await prisma.products.update({
      where: { id: product_id },
      data: {
        publicado_site: publicado,
        url_site: publicado ? slug : null,
      },
    })

    return NextResponse.json({ success: true, data: product, message: publicado ? 'Produto publicado' : 'Produto despublicado' })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
