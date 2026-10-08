/**
 * Refetch otimizado: busca listings de cada item no ML e linka com product_id
 * Pra vendas que têm items com product_id = NULL (órfãos)
 *
 * GET /api/admin/refetch-orfãos?company_id=X&batch_size=50
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
  const batchSize = Math.max(10, Math.min(Number(searchParams.get('batch_size') || 100), 300))
  const dryRun = searchParams.get('dry_run') === 'true'

  try {
    const acc = await prisma.marketplace_accounts.findFirst({
      where: { company_id: companyId, plataforma: 'mercado_livre' },
    })
    if (!acc) return NextResponse.json({ ok: false, error: 'Conta ML não encontrada' }, { status: 404 })

    const tokenRes = await getMLToken(companyId)
    if (!tokenRes?.token) return NextResponse.json({ ok: false, error: 'Sem token' }, { status: 401 })
    const token = tokenRes.token

    // Conta quantos items órfãos existem
    const count: any[] = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*)::int as orfaos,
             COUNT(DISTINCT o.id)::int as vendas_afetadas
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.company_id = $1::uuid
        AND o.origem = 'mercado_livre'::order_origem
        AND o.status != 'cancelado'
        AND oi.product_id IS NULL
    `, companyId)

    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dry_run: true,
        ...count[0],
        mensagem: 'Roda de novo SEM dry_run pra processar',
      })
    }

    // Pega as vendas com items órfãos
    const vendas: any[] = await prisma.$queryRawUnsafe(`
      SELECT o.id, o.order_number, o.created_at
      FROM orders o
      WHERE o.company_id = $1::uuid
        AND o.origem = 'mercado_livre'::order_origem
        AND o.status != 'cancelado'
        AND EXISTS (
          SELECT 1 FROM order_items oi
          WHERE oi.order_id = o.id
            AND oi.product_id IS NULL
        )
      ORDER BY o.created_at DESC
      LIMIT $2
    `, companyId, batchSize)

    let vinculados = 0
    let semListing = 0
    let erros = 0
    const errorSamples: string[] = []
    let rateLimitHits = 0
    const t0 = Date.now()

    for (const v of vendas) {
      try {
        const r = await fetch(`https://api.mercadolibre.com/orders/${v.order_number}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (r.status === 429) {
          rateLimitHits++
          if (rateLimitHits > 5) {
            errorSamples.push('Rate limit persistente')
            break
          }
          await new Promise(r => setTimeout(r, 65000))
          continue
        }
        if (!r.ok) {
          erros++
          if (errorSamples.length < 5) errorSamples.push(`${v.order_number}: ${r.status}`)
          continue
        }
        const detail: any = await r.json()
        const mlItems = detail.order_items || []

        for (const item of mlItems) {
          const mlItemId = String(item.item?.id || '').trim()
          if (!mlItemId) continue
          const mlSku = String(item.item?.seller_custom_field || '').trim() || null
          const qtd = Number(item.quantity || 1)
          const precoUnit = Number(item.unit_price || 0)

          // Tenta achar via listing_id (mais confiável)
          let productId: string | null = null
          const listing = await prisma.marketplace_listings.findFirst({
            where: { listing_id: mlItemId, account_id: acc.id },
            select: { product_id: true },
          })
          if (listing?.product_id) {
            productId = listing.product_id
          } else if (mlSku) {
            const prod = await prisma.products.findUnique({
              where: { sku: mlSku },
              select: { id: true },
            })
            if (prod) productId = prod.id
          }

          if (!productId) {
            semListing++
            continue
          }

          // Custo
          const pp = await prisma.product_prices.findFirst({
            where: { product_id: productId, company_id: companyId, custo: { gt: 0 } },
            select: { custo: true },
          })
          const custoUnit = pp ? Number(pp.custo) : null

          // Atualiza items com product_id = NULL pra esse order_id
          // Filtra por SKU se tiver, senão por nome_produto (pega o primeiro match)
          const where: any = {
            order_id: v.id,
            product_id: null,
          }
          if (mlSku) where.sku = mlSku

          const updateResult = await prisma.order_items.updateMany({
            where,
            data: {
              product_id: productId,
              sku: mlSku || mlItemId,
              custo_unitario: custoUnit,
            },
          })
          vinculados += updateResult.count
        }
      } catch (e: any) {
        erros++
        if (errorSamples.length < 5) errorSamples.push(`${v.order_number}: ${e.message?.substring(0, 100)}`)
      }
    }

    return NextResponse.json({
      ok: true,
      account: acc.nickname,
      orfãos_inicial: count[0]?.orfaos,
      vendas_processadas: vendas.length,
      items_vinculados: vinculados,
      sem_listing_match: semListing,
      erros,
      rate_limit_hits: rateLimitHits,
      erro_amostra: errorSamples,
      duracao_ms: Date.now() - t0,
      mensagem: vinculados > 0
        ? `✅ ${vinculados} items órfãos linkados com product_id (alguns com custo)`
        : 'Nenhum item foi linkado nesta rodada',
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message, stack: err.stack?.substring(0, 500) }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}
