import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 min

/**
 * POST /api/admin/importar-vendas-parceiro
 * Body: { company_id: string, order_numbers: string[] }
 *
 * Para cada order_number:
 *  1) GET https://api.mercadolibre.com/orders/{id} (com token ML da LIURAESSENCE)
 *  2) Salva a venda em `orders` com company_id da empresa parceira
 *  3) Cria order_items com sku, qty, preco, sale_fee
 *
 * Retorna { ok, imported: [...], failed: [...] }
 *
 * IMPORTANTE: cada empresa parceira precisa ter seu próprio access_token ML cadastrado em `companies.access_token_ml`.
 * Se não tiver, tenta usar o token da matriz LIURAESSENCE (mas orders de outras contas ML vão dar 403).
 */
export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Basic ${Buffer.from('premium:shine2026').toString('base64')}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Body inválido (JSON)' }, { status: 400 })
  }

  const { company_id, order_numbers } = body
  if (!company_id) {
    return NextResponse.json({ ok: false, error: 'company_id obrigatório' }, { status: 400 })
  }
  if (!Array.isArray(order_numbers) || order_numbers.length === 0) {
    return NextResponse.json({ ok: false, error: 'order_numbers deve ser array não vazio' }, { status: 400 })
  }
  if (order_numbers.length > 50) {
    return NextResponse.json({ ok: false, error: 'Máximo 50 pedidos por vez (divida em lotes)' }, { status: 400 })
  }

  try {
    // 1. Verifica company
    const companyRes: any[] = await prisma.$queryRawUnsafe(
      `SELECT id, nome_fantasia, razao_social, cnpj, account_type, access_token_ml FROM companies WHERE id = $1::uuid`,
      company_id,
    )
    if (companyRes.length === 0) {
      return NextResponse.json({ ok: false, error: 'Empresa não encontrada' }, { status: 404 })
    }
    const company = companyRes[0]

    // 2. Pega token ML (preferência: token da empresa; fallback: token da matriz)
    let token: string | null = company.access_token_ml || null
    if (!token) {
      const acc = await prisma.marketplace_accounts.findFirst({
        where: { plataforma: 'mercado_livre', ativa: true, access_token: { not: null } },
        orderBy: { updated_at: 'desc' },
      })
      token = acc?.access_token || null
    }
    if (!token) {
      return NextResponse.json({
        ok: false,
        error: 'Nenhum access_token ML cadastrado. A empresa parceira precisa cadastrar o token dela em companies.access_token_ml, OU cadastre um token ML da matriz em marketplace_accounts.',
      }, { status: 400 })
    }

    // 3. Processa cada order_number
    const imported: any[] = []
    const failed: any[] = []
    const skipped: any[] = []

    for (const orderNum of order_numbers) {
      const orderNumber = String(orderNum).trim()
      if (!orderNumber) continue

      try {
        // 3a. Verifica se já existe
        const existing: any[] = await prisma.$queryRawUnsafe(
          `SELECT id, company_id FROM orders WHERE order_number = $1 LIMIT 1`,
          orderNumber,
        )
        if (existing.length > 0) {
          // Se já existe, NÃO reatribuir (a venda pertence legitimamente à company original)
          // Apenas reporta o conflito
          skipped.push({
            order_number: orderNumber,
            reason: existing[0].company_id === company_id
              ? 'já cadastrada nesta empresa'
              : 'já cadastrada em OUTRA empresa (não pode reatribuir)',
            current_company_id: existing[0].company_id,
          })
          continue
        }

        // 3b. Busca na API ML
        const r = await fetch(`https://api.mercadolibre.com/orders/${orderNumber}`, {
          headers: { Authorization: `Bearer ${token}` },
        })

        if (r.status === 404) {
          failed.push({ order_number: orderNumber, error: 'Pedido não encontrado no ML' })
          continue
        }
        if (r.status === 403) {
          failed.push({
            order_number: orderNumber,
            error: 'Token ML não tem permissão pra ler este pedido (403). A empresa parceira precisa cadastrar o access_token_ml dela em companies.access_token_ml.',
          })
          continue
        }
        if (!r.ok) {
          failed.push({ order_number: orderNumber, error: `ML /orders ${r.status}` })
          continue
        }

        const ml: any = await r.json()

        // 3c. Extrai dados essenciais
        const totalAmount = Number(ml.total_amount || 0)
        const subtotal = Number(ml.subtotal || totalAmount)
        const status = ml.status || 'unknown'
        const dateCreated = ml.date_created ? new Date(ml.date_created) : new Date()
        const shippingId = ml.shipping?.id || null
        const logisticType = ml.shipping?.logistic_type || null
        const packId = ml.pack_id ? String(ml.pack_id) : null

        // cupom total
        let couponAmount = 0
        if (Array.isArray(ml.payments)) {
          for (const p of ml.payments) {
            if (p.coupon_amount && Number(p.coupon_amount) > 0) {
              couponAmount += Number(p.coupon_amount)
            }
          }
        }

        // 3d. Cria order
        const items = Array.isArray(ml.order_items) ? ml.order_items : []
        const firstItem = items[0] || {}
        const orderItemId = firstItem.id || null

        const newOrder: any = await prisma.$queryRawUnsafe(`
          INSERT INTO orders (
            order_number, marketplace_order_id, total, subtotal, status, created_at,
            origem, company_id, pack_id, shipping_id, tipo_envio,
            desconto, custo_flex
          ) VALUES (
            $1, $2, $3, $4, $5, $6, 'mercado_livre', $7::uuid, $8, $9, $10, $11, 0
          )
          RETURNING id
        `, orderNumber, orderItemId, totalAmount, subtotal, status, dateCreated, company_id, packId, shippingId, logisticType, couponAmount)

        const newOrderId = newOrder[0]?.id

        // 3e. Cria order_items (se houver)
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
          } catch (e: any) {
            // Item pode ter constraint unique (order_id, ml_item_id), ignora silencioso
          }
        }

        imported.push({
          order_number: orderNumber,
          total: totalAmount,
          status,
          tipo_envio: logisticType,
          items_created: itemsCreated,
          id: newOrderId,
          action: 'created',
        })

        // Rate limit: 200ms entre requests
        await new Promise(r => setTimeout(r, 200))
      } catch (e: any) {
        failed.push({ order_number: orderNumber, error: e.message })
      }
    }

    return NextResponse.json({
      ok: true,
      imported,
      failed,
      skipped,
      total: order_numbers.length,
      company: { id: company.id, nome: company.nome_fantasia || company.razao_social },
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}