import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { callShopeeAPI } from '@/lib/shopee-auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * GET/POST /api/admin/sync-shopee-products?company_id=X
 *
 * Puxa produtos do Shopee via /api/v2/product/get_item_list e
 * /api/v2/product/get_item_base_info, salvando em `products`.
 *
 * Returns: { ok, encontrados, criados, atualizados, erros }
 */
export async function GET(req: NextRequest) {
  return run(req)
}
export async function POST(req: NextRequest) {
  return run(req)
}

async function run(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const companyId = searchParams.get('company_id')
    if (!companyId) return NextResponse.json({ ok: false, error: 'company_id obrigatório' }, { status: 400 })

    let offset = 0
    const pageSize = 50
    const allItemIds: number[] = []

    for (let i = 0; i < 20; i++) {
      const result = await callShopeeAPI<any>(companyId, '/api/v2/product/get_item_list', 'POST', {
        offset,
        page_size: pageSize,
        item_status: ['NORMAL'],
      })
      if (!result.ok) break
      const list = result.data?.response?.item || []
      for (const it of list) if (it.item_id) allItemIds.push(it.item_id)
      if (list.length < pageSize) break
      offset += pageSize
    }

    if (allItemIds.length === 0) {
      return NextResponse.json({ ok: true, encontrados: 0, criados: 0, message: 'Nenhum produto' })
    }

    // Pega detalhes em batches de 50
    let criados = 0
    let atualizados = 0
    const erros: any[] = []

    for (let i = 0; i < allItemIds.length; i += 50) {
      const batch = allItemIds.slice(i, i + 50)
      const result = await callShopeeAPI<any>(companyId, '/api/v2/product/get_item_base_info', 'POST', {
        item_id_list: batch,
        need_complaint_policy: false,
        need_brand: false,
      })
      if (!result.ok) { erros.push({ batch_start: i, error: result.error }); continue }
      const items = result.data?.response?.item_list || []

      for (const it of items) {
        try {
          // Upsert product (match por SKU = item_id; products não tem company_id direto — usa product_prices)
          const sku = String(it.item_id || '')
          const existing = await prisma.products.findUnique({ where: { sku } })
          if (existing) {
            await prisma.products.update({
              where: { id: existing.id },
              data: {
                nome: it.item_name || existing.nome,
                updated_at: new Date(),
              },
            })
            // Update/cria product_price com company
            if (companyId) {
              const preco = Number(it.price_info?.[0]?.current_price || 0)
              await prisma.product_prices.upsert({
                where: {
                  product_id_canal_company_id: {
                    product_id: existing.id, canal: 'shopee', company_id: companyId,
                  },
                } as any,
                create: {
                  product_id: existing.id, canal: 'shopee', company_id: companyId,
                  preco_venda: preco, custo: 0,
                },
                update: { preco_venda: preco, updated_at: new Date() },
              })
            }
            atualizados++
          } else {
            const novo = await prisma.products.create({
              data: {
                sku,
                nome: it.item_name || '',
                ativo: it.item_status === 'NORMAL',
                updated_at: new Date(),
                created_at: new Date(),
              },
            })
            if (companyId) {
              const preco = Number(it.price_info?.[0]?.current_price || 0)
              await prisma.product_prices.create({
                data: {
                  product_id: novo.id, canal: 'shopee', company_id: companyId,
                  preco_venda: preco, custo: 0,
                },
              })
            }
            criados++
          }
        } catch (e: any) {
          erros.push({ item: it.item_id, error: e.message })
        }
      }
    }

    return NextResponse.json({
      ok: true,
      encontrados: allItemIds.length,
      criados,
      atualizados,
      erros,
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message, stack: e.stack }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}
