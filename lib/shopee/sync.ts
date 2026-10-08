/**
 * =====================================================
 * SERVIÇO DE SINCRONIZAÇÃO SHOPEE
 * =====================================================
 * Funções para:
 *   - Sincronizar produtos (Shopee → sistema)
 *   - Sincronizar pedidos (Shopee → sistema)
 *   - Push de estoque (sistema → Shopee)
 * =====================================================
 */

// lib/shopee/sync.ts

import { PrismaClient } from '@prisma/client'
import { shopeeFetch } from './client'

const prisma = new PrismaClient()

// =====================================================
// 1) SINCRONIZAR PRODUTOS
// =====================================================
export async function syncProductsFromShopee(accountId: string): Promise<{
  total: number
  criados: number
  atualizados: number
  erros: string[]
}> {
  const result = { total: 0, criados: 0, atualizados: 0, erros: [] as string[] }

  try {
    // 1) Listar todos os itens da loja
    const offset = 0
    const pageSize = 100

    const itemsRes: any = await shopeeFetch(
      accountId,
      '/api/v2/product/get_item_list',
      {
        method: 'GET',
        query: { offset: String(offset), page_size: String(pageSize), item_status: 'NORMAL' },
      }
    )

    const itemIds: number[] = itemsRes.response?.item || []
    result.total = itemIds.length

    console.log(`[Shopee Sync] Encontrados ${itemIds.length} itens`)

    // 2) Para cada item, buscar detalhes
    for (const itemId of itemIds) {
      try {
        const itemRes: any = await shopeeFetch(
          accountId,
          '/api/v2/product/get_item_base_info',
          {
            method: 'GET',
            query: { item_id_list: JSON.stringify([itemId]) },
          }
        )

        const item = itemRes.response?.item_list?.[0]
        if (!item) continue

        // Extrair dados
        const sku = item.item_sku || String(itemId)
        const nome = item.item_name
        const categoriaShopee = item.category_id
        const foto = item.image?.image_url_list?.[0]
        const status = item.item_status // NORMAL, UNLIST, etc

        // 3) Buscar info de variação (preço, estoque)
        const modelRes: any = await shopeeFetch(
          accountId,
          '/api/v2/product/get_model_list',
          {
            method: 'GET',
            query: { item_id: String(itemId) },
          }
        )

        const models = modelRes.response?.model || []
        const totalEstoque = models.reduce(
          (acc: number, m: any) => acc + (m.stock_info_v2?.current_stock || 0),
          0
        )
        const precoMin = models.length > 0 ? Math.min(...models.map((m: any) => m.price_info_v2?.current_price || 0)) : 0

        // 4) Salvar/atualizar no banco
        const existing = await prisma.products.findFirst({
          where: { OR: [{ sku }, { id: undefined as any }] },
          include: { inventory: true },
        })

        let productId: string

        if (existing) {
          productId = existing.id
          await prisma.products.update({
            where: { id: existing.id },
            data: {
              nome,
              foto_principal_url: foto,
              ativo: status === 'NORMAL',
              updated_at: new Date(),
            },
          })
          result.atualizados++

          if (existing.inventory) {
            await prisma.inventory.update({
              where: { id: existing.inventory.id },
              data: { quantidade_atual: totalEstoque },
            })
          }
        } else {
          const defaultBrand = await prisma.brands.findFirst({
            where: { nome: 'PREMIUM SHINE' },
          })
          if (!defaultBrand) {
            result.erros.push(`Sem marca padrão`)
            continue
          }

          const novo = await prisma.products.create({
            data: {
              sku: `SPE-${sku}`,
              nome,
              foto_principal_url: foto,
              marca_id: defaultBrand.id,
              ativo: status === 'NORMAL',
              inventory: {
                create: { quantidade_atual: totalEstoque, quantidade_minima: 5 },
              },
            },
          })
          productId = novo.id
          result.criados++
        }

        // 5) Salvar listing
        const account = await prisma.marketplace_accounts.findUnique({ where: { id: accountId } })
        if (account) {
          await prisma.marketplace_listings.upsert({
            where: {
              account_id_listing_id: {
                account_id: accountId,
                listing_id: String(itemId),
              },
            },
            update: {
              product_id: productId,
              status: status === 'NORMAL' ? 'active' : 'paused',
              preco_atual: precoMin / 100000, // Shopee retorna em centavos
              last_sync_at: new Date(),
            },
            create: {
              product_id: productId,
              account_id: accountId,
              listing_id: String(itemId),
              status: status === 'NORMAL' ? 'active' : 'paused',
              preco_atual: precoMin / 100000,
              last_sync_at: new Date(),
            },
          })

          // 6) Salvar preço no canal Shopee
          if (account.company_id && precoMin > 0) {
            await prisma.product_prices.upsert({
              where: {
                product_id_canal_company_id: {
                  product_id: productId,
                  canal: 'shopee',
                  company_id: account.company_id,
                },
              },
              update: { preco_venda: precoMin / 100000 },
              create: {
                product_id: productId,
                canal: 'shopee',
                company_id: account.company_id,
                preco_venda: precoMin / 100000,
                custo: (precoMin / 100000) * 0.55,
              },
            })
          }
        }
      } catch (err: any) {
        result.erros.push(`Item ${itemId}: ${err.message}`)
      }
    }

    // Atualizar última sync
    await prisma.marketplace_accounts.update({
      where: { id: accountId },
      data: { ultima_sincronizacao: new Date() },
    })

    return result
  } catch (err: any) {
    console.error('[Shopee Sync Products]', err)
    throw err
  }
}

// =====================================================
// 2) SINCRONIZAR PEDIDOS
// =====================================================
export async function syncOrdersFromShopee(accountId: string, days = 7): Promise<{
  total: number
  criados: number
  erros: string[]
}> {
  const result = { total: 0, criados: 0, erros: [] as string[] }

  try {
    // Time range (em Unix timestamp)
    const timeTo = Math.floor(Date.now() / 1000)
    const timeFrom = timeTo - days * 24 * 60 * 60

    // 1) Listar pedidos
    const ordersRes: any = await shopeeFetch(
      accountId,
      '/api/v2/order/get_order_list',
      {
        method: 'GET',
        query: {
          time_from: String(timeFrom),
          time_to: String(timeTo),
          order_status: 'PAID',
          page_size: '50',
        },
      }
    )

    const orderSns: string[] = ordersRes.response?.order_list?.map((o: any) => o.order_sn) || []
    result.total = orderSns.length

    console.log(`[Shopee Sync Orders] ${orderSns.length} pedidos`)

    // 2) Para cada pedido, buscar detalhes
    for (const orderSn of orderSns) {
      try {
        // Verificar se já existe
        const existing = await prisma.orders.findFirst({
          where: { payment_id: orderSn },
        })
        if (existing) continue

        // Buscar detalhes
        const orderRes: any = await shopeeFetch(
          accountId,
          '/api/v2/order/get_order_detail',
          {
            method: 'GET',
            query: { order_sn_list: JSON.stringify([orderSn]) },
          }
        )

        const order = orderRes.response?.order_list?.[0]
        if (!order) continue

        // Criar pedido no sistema
        const totalReais = order.total_amount / 100000
        const newOrder = await prisma.orders.create({
          data: {
            order_number: `SPE-${orderSn}`,
            origem: 'shopee',
            company_id: (await prisma.marketplace_accounts.findUnique({ where: { id: accountId } }))?.company_id || '',
            marketplace_account_id: accountId,
            status: 'confirmado',
            subtotal: (order.total_amount - (order.shipping_fee || 0) - (order.buyer_payment_fee || 0)) / 100000,
            frete: (order.shipping_fee || 0) / 100000,
            total: totalReais,
            payment_id: orderSn,
            forma_pagamento: 'Shopee Pay',
            pago_em: order.pay_time ? new Date(order.pay_time * 1000) : null,
            // Endereço
            endereco_entrega: order.shipping_address || {},
            // Itens
            order_items: {
              create: (order.item_list || []).map((item: any) => ({
                product_id: null, // mapear depois via listing
                sku: item.item_sku || String(item.item_id),
                nome_produto: item.item_name,
                foto_url: item.image_info?.image_url,
                quantidade: item.model_quantity_purchased,
                preco_unitario: item.model_discounted_price / 100000,
                preco_total: (item.model_discounted_price * item.model_quantity_purchased) / 100000,
                custo_unitario: (item.model_discounted_price * 0.55) / 100000,
              })),
            },
          },
        })

        // Baixar estoque
        for (const item of order.item_list || []) {
          const sku = item.item_sku || String(item.item_id)
          const listing = await prisma.marketplace_listings.findFirst({
            where: { listing_id: String(item.item_id), account_id: accountId },
          })
          if (listing?.product_id) {
            const inv = await prisma.inventory.findFirst({
              where: { product_id: listing.product_id },
            })
            if (inv) {
              await prisma.inventory.update({
                where: { id: inv.id },
                data: {
                  quantidade_atual: Math.max(0, inv.quantidade_atual - item.model_quantity_purchased),
                  ultima_saida: new Date(),
                },
              })
            }
          }
        }

        result.criados++
      } catch (err: any) {
        result.erros.push(`Pedido ${orderSn}: ${err.message}`)
      }
    }

    return result
  } catch (err: any) {
    console.error('[Shopee Sync Orders]', err)
    throw err
  }
}

// =====================================================
// 3) PUSH ESTOQUE
// =====================================================
export async function pushStockToShopee(accountId: string, productId: string): Promise<boolean> {
  const listing = await prisma.marketplace_listings.findFirst({
    where: { product_id: productId, account_id: accountId },
  })

  if (!listing) throw new Error('Produto não está listado na Shopee desta conta')

  const inv = await prisma.inventory.findFirst({ where: { product_id: productId } })
  if (!inv) throw new Error('Sem registro de estoque')

  // Buscar modelos do item
  const modelsRes: any = await shopeeFetch(
    accountId,
    '/api/v2/product/get_model_list',
    {
      method: 'GET',
      query: { item_id: listing.listing_id },
    }
  )

  const models = modelsRes.response?.model || []
  if (models.length === 0) {
    throw new Error('Item sem variações/modelos')
  }

  // Atualizar cada modelo
  for (const model of models) {
    await shopeeFetch(accountId, '/api/v2/product/update_stock', {
      method: 'POST',
      query: { item_id: listing.listing_id, model_id: model.model_id },
      body: { stock_list: [{ model_id: model.model_id, current_stock: inv.quantidade_atual }] },
    })
  }

  return true
}
