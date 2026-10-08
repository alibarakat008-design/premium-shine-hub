// /api/admin/add-produtos-bulk
// POST: adiciona múltiplos produtos em lote com marca correta
// Body: { products: [{sku, nome, marca_id, ean?, volume?, custo?, preco_venda?}] }
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
    const { products } = body

    if (!Array.isArray(products) || products.length === 0) {
      return NextResponse.json({ ok: false, error: 'products deve ser um array' }, { status: 400 })
    }

    const LIURA_ID = 'e2633570-74da-4b14-9ca1-ba7b0670e612' // matriz

    const results = []
    for (const p of products) {
      const { sku, nome, marca_id, ean, volume, custo, preco_venda } = p
      if (!sku || !nome) {
        results.push({ ok: false, sku, error: 'sku + nome obrigatórios' })
        continue
      }
      if (!marca_id) {
        results.push({ ok: false, sku, error: 'marca_id obrigatório' })
        continue
      }

      try {
        // Check if already exists
        const existing = await prisma.products.findUnique({ where: { sku } })
        if (existing) {
          results.push({ ok: false, sku, error: 'SKU já existe', existing_id: existing.id })
          continue
        }

        // Create product
        const product = await prisma.products.create({
          data: {
            sku,
            nome,
            marca_id,
            ean: ean || null,
            volume: volume || null,
            ativo: true,
            publicado_site: false,
            publicado_shopee: false,
          },
          select: { id: true, sku: true, nome: true },
        })

        // Create product_prices if custo or preco_venda
        if (custo != null || preco_venda != null) {
          await prisma.product_prices.create({
            data: {
              product_id: product.id,
              canal: 'site_b2c',
              company_id: LIURA_ID,
              custo: custo ?? 0,
              preco_venda: preco_venda ?? 0,
            },
          })
        }

        results.push({ ok: true, sku, product_id: product.id })
      } catch (e: any) {
        results.push({ ok: false, sku, error: e.message })
      }
    }

    const sucessos = results.filter((r: any) => r.ok).length
    const erros = results.filter((r: any) => !r.ok).length
    return NextResponse.json({ ok: true, criados: sucessos, erros, results })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
