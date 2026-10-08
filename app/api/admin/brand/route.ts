// /app/api/admin/brand/route.ts
// PUT — atualizar nome da marca
// PATCH — atualizar produto (todos os campos do products + notas + ml_ids)
import { NextRequest, NextResponse } from 'next/server'
import { isMatrizRequest } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function PUT(req: NextRequest) {
  if (!isMatrizRequest(req)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const body = await req.json()
    const { brand_id, nome } = body
    if (!brand_id) return NextResponse.json({ success: false, error: 'brand_id obrigatório' }, { status: 400 })
    const escaped = (nome || '').trim().toUpperCase()
    const updated = await prisma.brands.update({
      where: { id: brand_id },
      data: { nome: escaped },
      select: { id: true, nome: true },
    })
    return NextResponse.json({ success: true, data: updated })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  if (!isMatrizRequest(req)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const body = await req.json()
    const { product_id, nome, sku, volume, ean, foto_principal_url,
            notas_top, notas_coracao, notas_fundo, ml_ids,
            custo, preco_venda } = body
    if (!product_id) return NextResponse.json({ success: false, error: 'product_id obrigatório' }, { status: 400 })

    const data: Record<string, any> = {}
    const MATRIZ = 'e2633570-74da-4b14-9ca1-ba7b0670e612'

    // Campos de products
    if (sku !== undefined) data.sku = sku
    if (nome !== undefined) data.nome = nome
    if (volume !== undefined) data.volume = volume || null
    if (ean !== undefined) data.ean = ean || null
    if (foto_principal_url !== undefined) data.foto_principal_url = foto_principal_url || null

    // Notas olfativas (merge com existente, só em notas_olfativas JSON)
    if (notas_top !== undefined || notas_coracao !== undefined || notas_fundo !== undefined) {
      const existing = await prisma.products.findUnique({
        where: { id: product_id },
        select: { notas_olfativas: true },
      })
      const existingNotas = (existing?.notas_olfativas as any) || {}
      data.notas_olfativas = {
        ...existingNotas,
        ...(notas_top !== undefined ? { topo: notas_top } : {}),
        ...(notas_coracao !== undefined ? { coracao: notas_coracao } : {}),
        ...(notas_fundo !== undefined ? { base: notas_fundo } : {}),
      }
    }

    if (ml_ids !== undefined) {
      data.ml_ids = Array.isArray(ml_ids) ? ml_ids.filter(Boolean) : []
    }

    data.updated_at = new Date()
    await prisma.products.update({ where: { id: product_id }, data })

    // product_prices: upsert custo/preco_venda (só campos non-null)
    if (custo !== undefined || preco_venda !== undefined) {
      const existingPrice = await prisma.product_prices.findFirst({
        where: { product_id, canal: 'site_b2c' },
        select: { id: true, company_id: true },
      })
      const priceData: Record<string, any> = {}
      if (custo !== undefined) priceData.custo = custo === '' || custo === null ? null : parseFloat(String(custo))
      if (preco_venda !== undefined) priceData.preco_venda = preco_venda === '' || preco_venda === null ? 0 : parseFloat(String(preco_venda))

      if (existingPrice && Object.keys(priceData).length > 0) {
        await prisma.product_prices.update({
          where: { id: existingPrice.id },
          data: { ...priceData, updated_at: new Date() },
        })
      } else if (Object.keys(priceData).length > 0) {
        await (prisma.product_prices as any).create({
          data: { product_id, canal: 'site_b2c', ...priceData },
        })
      }
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[brand PATCH]', err)
    if (err.code === 'P2002') {
      return NextResponse.json({ success: false, error: `SKU já existe` }, { status: 400 })
    }
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
