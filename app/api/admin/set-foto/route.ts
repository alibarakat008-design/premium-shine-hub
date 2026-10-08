/**
 * =====================================================
 * API: Set Foto de Produto (via SKU ou ID)
 * =====================================================
 * POST /api/admin/set-foto
 * Body: { sku?: string, id?: string, foto_url: string }
 * =====================================================
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isMatrizRequest } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  if (!isMatrizRequest(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const { sku, id, foto_url } = await req.json()

    if (!foto_url) {
      return NextResponse.json({ ok: false, error: 'foto_url obrigatório' }, { status: 400 })
    }

    let product
    if (id) {
      product = await prisma.products.update({
        where: { id },
        data: { foto_principal_url: foto_url, updated_at: new Date() },
        select: { id: true, sku: true, nome: true, foto_principal_url: true },
      })
    } else if (sku) {
      product = await prisma.products.update({
        where: { sku },
        data: { foto_principal_url: foto_url, updated_at: new Date() },
        select: { id: true, sku: true, nome: true, foto_principal_url: true },
      })
    } else {
      return NextResponse.json({ ok: false, error: 'sku ou id obrigatório' }, { status: 400 })
    }

    return NextResponse.json({ ok: true, product })
  } catch (err: any) {
    console.error('[set-foto]', err)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
