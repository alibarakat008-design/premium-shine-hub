/**
 * Sync listings de uma conta ML.
 * Versão SIMPLES usando Prisma ORM (sem raw SQL).
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getMLToken } from '@/lib/ml-auth-multi'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const accountId = searchParams.get('account_id')
  const maxListings = Math.min(Number(searchParams.get('max_listings') || 500), 5000)

  if (!accountId) {
    return NextResponse.json({ ok: false, error: 'account_id obrigatório' }, { status: 400 })
  }

  const acc: any = await prisma.marketplace_accounts.findUnique({ where: { id: accountId } })
  if (!acc) return NextResponse.json({ ok: false, error: 'Conta não encontrada' }, { status: 404 })

  const tokenRes = await getMLToken(acc.company_id)
  if (!tokenRes?.token) return NextResponse.json({ ok: false, error: 'Sem token' }, { status: 401 })
  const token = tokenRes.token

  const t0 = Date.now()
  const result: any = {
    ok: true,
    account_id: accountId,
    account_nickname: acc.nickname,
    listings_ml_total: 0,
    listings_criados: 0,
    products_criados: 0,
    linkados: 0,
    erros: [] as string[],
  }

  try {
    // 1) Lista todos os listings ativos da conta (com paginação)
    const mlmIds: string[] = []
    let offset = 0
    const pageSize = 50
    let totalMl: number = 0
    let rateLimitHits = 0
    while (mlmIds.length < maxListings) {
      const searchUrl = `https://api.mercadolibre.com/users/${acc.account_id}/items/search?status=active&limit=${pageSize}&offset=${offset}`
      const r = await fetch(searchUrl, { headers: { Authorization: `Bearer ${token}` } })
      if (r.status === 429) {
        rateLimitHits++
        if (rateLimitHits > 5) break
        await sleep(65000)
        continue
      }
      if (!r.ok) {
        result.erros.push(`ML search ${r.status} offset=${offset}`)
        break
      }
      const j = await r.json()
      const page = j.results || []
      totalMl = j.paging?.total || 0
      if (page.length === 0) break
      mlmIds.push(...page)
      if (mlmIds.length >= totalMl) break
      offset += pageSize
      if (offset > 10000) break // safety
    }
    const finalIds = mlmIds.slice(0, maxListings)
    result.listings_ml_total = totalMl
    result.paginas_processadas = Math.ceil(finalIds.length / pageSize)
    console.log('[sync-products] account=' + acc.nickname + ' total_ml=' + totalMl + ' coletados=' + finalIds.length)

    // 2) Pra cada listing, busca detalhe
    for (const mlmId of finalIds) {
      try {
        const detRes = await fetch(`https://api.mercadolibre.com/items/${mlmId}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (detRes.status === 429) {
          await sleep(65000)
          continue
        }
        if (!detRes.ok) {
          result.erros.push(`${mlmId}: ML ${detRes.status}`)
          continue
        }
        const item: any = await detRes.json()

        const sku: string | null = item.seller_custom_field || item.seller_sku || null
        const title: string = item.title || ''
        const price: number = Number(item.price || 0)
        const availableQty: number = Number(item.available_quantity || 0)
        const categoryId: string | null = item.category_id || null
        const permalink: string | null = item.permalink || null
        const status: string = item.status || 'active'

        // 3) Cria ou pega product_id pelo SKU
        // Fallback: se não tem seller_custom_field, usa o listing_id (MLB ID) como SKU
        const finalSku = sku || `MLB-${mlmId.replace(/^MLB/, '')}`
        let productId: string | null = null
        {
          const existing = await prisma.products.findUnique({ where: { sku: finalSku } })
          if (existing) {
            productId = existing.id
          } else {
            const created = await prisma.products.create({
              data: {
                sku: finalSku,
                nome: title,
                ativo: true,
              },
            })
            productId = created.id
            result.products_criados++
          }
        }

        // 4) Upsert marketplace_listing
        await prisma.marketplace_listings.upsert({
          where: { account_id_listing_id: { account_id: accountId, listing_id: mlmId } },
          create: {
            listing_id: mlmId,
            product_id: productId,
            account_id: accountId,
            status,
            preco_atual: price,
            preco_original: price,
            stock_disponivel_ml: availableQty,
            categoria_id_ml: categoryId,
            permalink,
            last_sync_at: new Date(),
          },
          update: {
            product_id: productId || undefined,
            status,
            preco_atual: price,
            stock_disponivel_ml: availableQty,
            last_sync_at: new Date(),
          },
        })
        result.listings_criados++

        // 5) Cria/atualiza product_prices (preço de venda) pra esta empresa
        if (productId && price > 0) {
          await prisma.product_prices.upsert({
            where: {
              product_id_canal_company_id: {
                product_id: productId,
                canal: 'mercado_livre',
                company_id: acc.company_id,
              },
            },
            create: {
              product_id: productId,
              company_id: acc.company_id,
              canal: 'mercado_livre',
              preco_venda: price,
            },
            update: { preco_venda: price },
          })
        }

        await sleep(80)
      } catch (e: any) {
        result.erros.push(`${mlmId}: ${e.message?.substring(0, 100)}`)
      }
    }

    // 6) Linka order_items.product_id via marketplace_listings
    const linkResult = await prisma.$executeRawUnsafe(`
      UPDATE order_items oi
      SET product_id = ml.product_id
      FROM marketplace_listings ml, orders o
      WHERE oi.order_id = o.id
        AND o.marketplace_account_id = ml.account_id
        AND ml.listing_id = oi.sku
        AND oi.product_id IS NULL
        AND ml.product_id IS NOT NULL
    `)
    result.linkados = linkResult
    result.duracao_ms = Date.now() - t0
    return NextResponse.json(result)
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}
