import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const products = Array.isArray(body.products) ? body.products : [body]
    const results: any[] = []

    for (const p of products) {
      const { sku, nome, custo, preco_venda, marca_id = null } = p
      if (!sku || !nome) {
        results.push({ sku, ok: false, error: 'sku + nome required' })
        continue
      }

      // 1. cria/atualiza product
      const product = await prisma.products.upsert({
        where: { sku },
        update: { nome },
        create: {
          sku,
          nome,
          ativo: true,
          publicado_site: false,
          publicado_shopee: false,
        },
      })

      // 2. cria/atualiza product_prices (canal=mercado_livre)
      const pp = await prisma.product_prices.findFirst({
        where: { product_id: product.id, canal: 'mercado_livre' },
      })

      const ppData: any = {
        custo: custo ?? 0,
        preco_venda: preco_venda ?? 0,
      }
      if (pp) {
        await prisma.product_prices.update({
          where: { id: pp.id },
          data: ppData,
        })
      } else {
        await prisma.product_prices.create({
          data: {
            ...ppData,
            product_id: product.id,
            canal: 'mercado_livre',
          },
        })
      }

      results.push({
        sku,
        product_id: product.id,
        product_prices_custo: custo,
        product_prices_preco: preco_venda,
        ok: true,
      })
    }

    return NextResponse.json({ ok: true, results })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}