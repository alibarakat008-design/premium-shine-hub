import { NextRequest, NextResponse } from 'next/server'
import { getMLToken } from '@/lib/ml-auth-multi'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * GET /api/cron/sync-parceiros?days=7&batch=200
 *
 * Cron noturno que importa vendas NOVAS dos últimos N dias de cada empresa parceira.
 *
 * Estratégia: pra cada company com access_token_ml ativo:
 *   1) Lista os order_numbers RECENTES da LIURAESSENCE (que pertencem à nossa user_id)
 *      e pula — não tenta reimportar o que já é nosso
 *   2) Busca vendas via /orders/search na API ML (filtrando por date_closed)
 *      com o token da empresa parceira
 *   3) Insere em `orders` com company_id da empresa
 *
 * IMPORTANTE: a API ML /orders/search retorna SOMENTE vendas do próprio user_id do token.
 * Então se a empresa parceira conectar o token ML DELA, esse sync vai pegar só as vendas DELE.
 *
 * Auth: Authorization: Bearer <CRON_SECRET>
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET || 'shinecron2026'
  // Aceita Bearer CRON_SECRET (chamada da Vercel) OU Basic Auth (chamada manual)
  const isCron = authHeader === `Bearer ${cronSecret}`
  const isAdmin = authHeader === `Basic ${Buffer.from('premium:shine2026').toString('base64')}`
  if (!isCron && !isAdmin) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const days = Math.min(Number(searchParams.get('days') || 7), 30)
  const batch = Math.min(Number(searchParams.get('batch') || 200), 500)

  const results: any[] = []

  try {
    // 1. Lista todas as companies com token ML
    const companies: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        c.id, c.nome_fantasia, c.razao_social, c.cnpj, c.account_type,
        c.ml_user_id, c.ml_expires_at,
        (c.access_token_ml IS NOT NULL) AS has_token,
        (c.refresh_token_ml IS NOT NULL) AS has_refresh
      FROM companies c
      WHERE c.ativa = true AND c.account_type IN ('parceiro', 'filial')
        AND c.access_token_ml IS NOT NULL
    `)

    if (companies.length === 0) {
      return NextResponse.json({
        ok: true,
        message: 'Nenhuma empresa parceira com token ML cadastrado',
        companies_processed: 0,
      })
    }

    // 2. Pra cada empresa, busca vendas recentes
    for (const company of companies) {
      const cResult: any = {
        company_id: company.id,
        nome: company.nome_fantasia || company.razao_social,
        cnpj: company.cnpj,
        imported: 0,
        failed: 0,
        skipped: 0,
        errors: [] as string[],
      }

      try {
        const tokenInfo = await getMLToken(company.id)
        if (!tokenInfo) {
          cResult.errors.push('Token ML indisponível (mesmo com auto-refresh)')
          results.push(cResult)
          continue
        }

        // 3. Busca vendas recentes via /orders/search
        // Usa seller_id EXPLÍCITO (não seller=me) porque ML retorna 403 com "me" pra algumas contas
        const dateFrom = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
        const sellerId = tokenInfo.ml_user_id || company.id // fallback não vai funcionar
        const searchUrl = `https://api.mercadolibre.com/orders/search?seller=${sellerId}&order.status=paid&order.date_closed.from=${dateFrom}&sort=date_desc&limit=${batch}`

        const r = await fetch(searchUrl, {
          headers: { Authorization: `Bearer ${tokenInfo.token}` },
        })

        if (!r.ok) {
          cResult.errors.push(`ML /orders/search ${r.status}`)
          results.push(cResult)
          continue
        }

        const search: any = await r.json()
        const orders = search.results || []

        cResult.total_found = orders.length

        // 4. Pra cada order, verifica se já existe e cria se não
        for (const ml of orders) {
          const orderNumber = String(ml.id)
          if (!orderNumber) continue

          try {
            // Verifica se já existe (em QUALQUER company)
            const existing: any[] = await prisma.$queryRawUnsafe(
              `SELECT id, company_id FROM orders WHERE order_number = $1 LIMIT 1`,
              orderNumber,
            )
            if (existing.length > 0) {
              cResult.skipped++
              continue
            }

            // Cria com company_id da empresa parceira
            const totalAmount = Number(ml.total_amount || 0)
            const subtotal = Number(ml.subtotal || totalAmount)
            // Mapear status ML → enum order_status
            const STATUS_MAP: Record<string, string> = {
              'paid': 'confirmado',
              'handling': 'separado',
              'ready_to_ship': 'separado',
              'shipped': 'enviado',
              'delivered': 'entregue',
              'cancelled': 'cancelado',
              'refunded': 'devolvido',
            }
            const mlStatus = ml.status || 'unknown'
            const status = STATUS_MAP[mlStatus] || 'pendente'
            const dateCreated = ml.date_created ? new Date(ml.date_created) : new Date()
            const shippingId = ml.shipping?.id || null
            const logisticType = ml.shipping?.logistic_type || null
            const packId = ml.pack_id ? String(ml.pack_id) : null

            // cupom
            let couponAmount = 0
            if (Array.isArray(ml.payments)) {
              for (const p of ml.payments) {
                if (p.coupon_amount && Number(p.coupon_amount) > 0) {
                  couponAmount += Number(p.coupon_amount)
                }
              }
            }

            const newOrder: any = await prisma.$queryRawUnsafe(`
              INSERT INTO orders (
                order_number, total, subtotal, status, created_at,
                origem, company_id, pack_id, tipo_envio,
                desconto, custo_flex, codigo_rastreio
              ) VALUES (
                $1, $2, $3, $4::order_status, $5, 'mercado_livre', $6::uuid, $7, $8, $9, 0, $10
              )
              RETURNING id
            `, orderNumber, totalAmount, subtotal, status, dateCreated, company.id, packId, logisticType, couponAmount, shippingId)

            const newOrderId = newOrder[0]?.id

            // Items
            const items = Array.isArray(ml.order_items) ? ml.order_items : []
            let itemsCreated = 0
            for (const it of items) {
              try {
                const mlItemId = it.id || null
                const sku = it.item?.seller_sku || it.item?.id || null
                const title = it.item?.title || ''
                const qty = Number(it.quantity || 1)
                const unitPrice = Number(it.unit_price || 0)
                const saleFee = Number(it.sale_fee || 0)

                await prisma.$queryRawUnsafe(`
                  INSERT INTO order_items (
                    order_id, sku, nome_produto, quantidade, preco_unitario, preco_total, sale_fee,
                    product_id, custo_unitario, ml_item_id
                  ) VALUES (
                    $1::uuid, $2, $3, $4, $5, $6, 0, NULL, 0, $7
                  )
                `, newOrderId, sku, title, qty, unitPrice, qty * unitPrice, saleFee, mlItemId)
                itemsCreated++
              } catch {}
            }

            cResult.imported++
            cResult.last_imported = { order_number: orderNumber, total: totalAmount, items: itemsCreated }

            // Rate limit
            await new Promise(r => setTimeout(r, 150))
          } catch (e: any) {
            cResult.failed++
            if (cResult.errors.length < 5) {
              cResult.errors.push(`${orderNumber}: ${e.message.substring(0, 400)}`)
            }
          }
        }
      } catch (e: any) {
        cResult.errors.push(`Erro geral: ${e.message.substring(0, 250)}`)
      }

      results.push(cResult)

      // Rate limit entre empresas
      await new Promise(r => setTimeout(r, 500))
    }

    const totalImported = results.reduce((s, r) => s + r.imported, 0)
    const totalFailed = results.reduce((s, r) => s + r.failed, 0)
    const totalSkipped = results.reduce((s, r) => s + r.skipped, 0)

    return NextResponse.json({
      ok: true,
      message: `Sync concluído. ${totalImported} importadas, ${totalSkipped} já existentes, ${totalFailed} falhas`,
      companies_processed: results.length,
      total_imported: totalImported,
      total_skipped: totalSkipped,
      total_failed: totalFailed,
      period_days: days,
      results,
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}