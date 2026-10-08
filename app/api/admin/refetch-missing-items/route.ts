/**
 * Refetch order_items de vendas que não têm items linkados ou items sem product_id
 * Usa o ML API pra pegar o detalhe
 *
 * GET /api/admin/refetch-missing-items?company_id=X&limit=200
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getMLToken } from '@/lib/ml-auth-multi'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

const BASIC = 'Basic ' + Buffer.from('premium:shine2026').toString('base64')
const LIURA = 'e2633570-74da-4b14-9ca1-ba7b0670e612'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== BASIC) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }
  const { searchParams } = new URL(req.url)
  const companyId = searchParams.get('company_id') || LIURA
  const limit = Math.max(1, Math.min(Number(searchParams.get('limit') || 200), 500))
  const dryRun = searchParams.get('dry_run') === 'true'

  try {
    const acc = await prisma.marketplace_accounts.findFirst({
      where: { company_id: companyId, plataforma: 'mercado_livre' },
    })
    if (!acc) return NextResponse.json({ ok: false, error: 'Conta ML não encontrada' }, { status: 404 })

    const tokenRes = await getMLToken(companyId)
    if (!tokenRes?.token) return NextResponse.json({ ok: false, error: 'Sem token ML' }, { status: 401 })
    const token = tokenRes.token

    // Lista vendas sem items ou com items sem product_id
    const vendasProblema: any[] = await prisma.$queryRawUnsafe(`
      WITH vendas_com_problema AS (
        SELECT o.id, o.order_number, o.created_at
        FROM orders o
        WHERE o.company_id = $1::uuid
          AND o.origem = 'mercado_livre'::order_origem
          AND o.status != 'cancelado'
          AND (
            NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id)
            OR EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id AND oi.product_id IS NULL)
          )
        ORDER BY o.created_at DESC
        LIMIT $2
      )
      SELECT * FROM vendas_com_problema
    `, companyId, limit)

    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dry_run: true,
        total_vendas_com_problema: vendasProblema.length,
        vendas: vendasProblema,
      })
    }

    let criados = 0
    let atualizados = 0
    let erros = 0
    const errorSamples: string[] = []
    let rateLimitHits = 0

    for (const v of vendasProblema) {
      try {
        // 1) Buscar detalhe do pedido no ML
        const r = await fetch(`https://api.mercadolibre.com/orders/${v.order_number}`, {
          headers: { Authorization: `Bearer ${token}` },
        })

        if (r.status === 429) {
          rateLimitHits++
          if (rateLimitHits > 5) {
            errorSamples.push('Rate limit persistente, parando')
            break
          }
          await new Promise(r => setTimeout(r, 65000))
          continue
        }
        if (!r.ok) {
          erros++
          errorSamples.push(`${v.order_number}: ML ${r.status}`)
          continue
        }

        const detail: any = await r.json()
        const mlItems = detail.order_items || []

        if (mlItems.length === 0) {
          erros++
          errorSamples.push(`${v.order_number}: sem items no ML`)
          continue
        }

        // 2) Pra cada item, achar product via listing_id e criar order_item
        for (const item of mlItems) {
          const mlItemId = String(item.item?.id || '').trim()
          if (!mlItemId) continue
          const sku = String(item.item?.seller_custom_field || '').trim() || null
          const qtd = Number(item.quantity || 1)
          const precoUnit = Number(item.unit_price || 0)

          // Acha product
          let productId: string | null = null
          if (sku) {
            const prod = await prisma.products.findUnique({
              where: { sku },
              select: { id: true },
            })
            if (prod) productId = prod.id
          }
          if (!productId) {
            // Tenta via listing
            const listing = await prisma.marketplace_listings.findFirst({
              where: { listing_id: mlItemId, account_id: acc.id },
              select: { product_id: true },
            })
            if (listing?.product_id) productId = listing.product_id
          }

          // Custo
          let custoUnit: number | null = null
          if (productId) {
            const pp = await prisma.product_prices.findFirst({
              where: { product_id: productId, company_id: companyId, custo: { gt: 0 } },
              select: { custo: true },
            })
            if (pp) custoUnit = Number(pp.custo)
          }

          // Cria/atualiza order_item (idempotente por order_id+item_id via deleteMany)
          await prisma.order_items.deleteMany({
            where: { order_id: v.id, sku: sku || mlItemId },
          })
          await prisma.order_items.create({
            data: {
              order_id: v.id,
              product_id: productId,
              sku: sku || mlItemId,
              nome_produto: item.item?.title || null,
              foto_url: item.item?.thumbnail || null,
              quantidade: qtd,
              preco_unitario: precoUnit,
              preco_total: precoUnit * qtd,
              custo_unitario: custoUnit,
            },
          })

          if (custoUnit) {
            atualizados++
          } else {
            criados++
          }
        }
      } catch (e: any) {
        erros++
        errorSamples.push(`${v.order_number}: ${e.message?.substring(0, 100)}`)
      }
    }

    return NextResponse.json({
      ok: true,
      account: acc.nickname,
      vendas_processadas: vendasProblema.length,
      items_criados: criados,
      items_atualizados_com_custo: atualizados,
      erros,
      rate_limit_hits: rateLimitHits,
      erro_amostra: errorSamples.slice(0, 5),
      mensagem: 'Items refetched do ML. Custo preenchido quando o produto tinha custo cadastrado.',
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message, stack: err.stack?.substring(0, 500) }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}
