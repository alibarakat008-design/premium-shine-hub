/**
 * =====================================================
 * SERVIÇO DE SINCRONIZAÇÃO MERCADO LIVRE
 * =====================================================
 * Funções reutilizáveis pra:
 *   - Atualizar token (refresh) automaticamente
 *   - Sincronizar produtos (ML → sistema)
 *   - Sincronizar pedidos (ML → sistema)
 *   - Atualizar estoque (sistema → ML)
 *   - Receber webhooks do ML
 * =====================================================
 */

// lib/mercadolivre/sync.ts

import { PrismaClient } from '@prisma/client'
import { refreshAccessToken } from './auth'

const prisma = new PrismaClient()
const ML_API_BASE = 'https://api.mercadolibre.com'

// =====================================================
// HELPER: Fazer requisição autenticada (com refresh automático)
// =====================================================
async function mlFetch(
  accountId: string,
  path: string,
  options: RequestInit = {}
): Promise<any> {
  const account = await prisma.marketplace_accounts.findUnique({
    where: { id: accountId },
  })

  if (!account || !account.ativa) {
    throw new Error('Conta ML não encontrada ou inativa')
  }

  // Verificar se token está expirado (margem de 5 min)
  const expiraEm = account.token_expira_em ? new Date(account.token_expira_em).getTime() : 0
  const expiraEmMenos5min = expiraEm - 5 * 60 * 1000

  let accessToken = account.access_token

  if (Date.now() > expiraEmMenos5min) {
    // Token expirado ou perto de expirar, fazer refresh
    console.log(`[ML] Token expirado, fazendo refresh da conta ${account.nickname}...`)
    const refreshed = await refreshAccessToken(accountId)
    accessToken = refreshed.access_token
  }

  // Fazer requisição
  const url = path.startsWith('http') ? path : `${ML_API_BASE}${path}`
  const res = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  })

  if (!res.ok) {
    const errBody = await res.text()
    throw new Error(`ML API error ${res.status}: ${errBody}`)
  }

  return res.json()
}

// =====================================================
// 1) SINCRONIZAR PRODUTOS (ML → SISTEMA)
// =====================================================
export async function syncProductsFromML(
  accountId: string,
  options: { limit?: number; fullSync?: boolean } = {}
): Promise<{
  total: number
  criados: number
  atualizados: number
  erros: string[]
  temMais: boolean
}> {
  const account = await prisma.marketplace_accounts.findUnique({
    where: { id: accountId },
  })

  if (!account) throw new Error('Conta não encontrada')

  const result = { total: 0, criados: 0, atualizados: 0, erros: [] as string[], temMais: false }

  try {
    // 1) Buscar todos os itens da conta (com paginação automática se fullSync)
    let allItemIds: string[] = []
    let offset = 0
    const pageSize = 50
    const maxItems = options.fullSync ? 1000 : (options.limit ?? 20)

    do {
      const searchRes = await mlFetch(
        accountId,
        `/users/${account.account_id}/items/search?limit=${pageSize}&offset=${offset}`
      )
      const ids: string[] = searchRes.results || []
      allItemIds = allItemIds.concat(ids)
      offset += pageSize
      if (!options.fullSync && allItemIds.length >= maxItems) {
        allItemIds = allItemIds.slice(0, maxItems)
        break
      }
      if (ids.length < pageSize) break
      if (allItemIds.length >= 1000) break
    } while (true)

    const itemIds = allItemIds
    result.total = itemIds.length
    result.temMais = !options.fullSync && itemIds.length >= maxItems

    console.log(`[ML Sync] Encontrados ${itemIds.length} itens na conta ${account.nickname} (temMais: ${result.temMais})`)

    // 2) Pra cada item, buscar detalhes e salvar (em batches paralelos de 10)
    const processItem = async (itemId: string) => {
      try {
        const item: any = await mlFetch(accountId, `/items/${itemId}`)

        // Extrair dados
        const sku = item.seller_custom_field || item.id
        const ean = item.attributes?.find((a: any) => a.id === 'EAN')?.value_name || null
        const nome = item.title
        const preco = item.price
        const quantidade = item.available_quantity
        const foto = item.secure_thumbnail || item.thumbnail
        // Pegar todas as fotos do ML (campo pictures)
        const fotosML: string[] = (item.pictures || []).map((p: any) => p.secure_url || p.url).filter(Boolean)
        // Adicionar a thumbnail como principal se não tiver nas pictures
        if (foto && !fotosML.includes(foto)) fotosML.unshift(foto)
        const categoriaML = item.category_id
        const status = item.status // active, paused, closed

        // 3) Salvar/atualizar no banco
        const skuComPrefixo = `ML-${sku}`
        const existing = await prisma.products.findFirst({
          where: {
            OR: [{ sku: skuComPrefixo }, { sku }, { ean: ean || undefined }],
          },
          include: { inventory: true },
        })

        let productId: string

        if (existing) {
          productId = existing.id
          // Atualizar dados básicos
          await prisma.products.update({
            where: { id: existing.id },
            data: {
              nome,
              foto_principal_url: foto,
              fotos_adicionais: fotosML.length > 1 ? fotosML.slice(1) : existing.fotos_adicionais || [],
              ativo: status === 'active',
              updated_at: new Date(),
            },
          })
          result.atualizados++

          // Atualizar estoque
          if (existing.inventory) {
            await prisma.inventory.update({
              where: { id: existing.inventory.id },
              data: { quantidade_atual: quantidade },
            })
          }
        } else {
          // Criar produto novo
          // (assumindo marca padrão e categoria padrão — ajustar depois)
          const defaultBrand = await prisma.brands.findFirst({
            where: { nome: 'PREMIUM SHINE' },
          })
          if (!defaultBrand) {
            result.erros.push(`Sem marca padrão para criar item ${itemId}`)
            return
          }

          const novo = await prisma.products.create({
            data: {
              sku: skuComPrefixo,
              ean: ean || null,
              nome,
              foto_principal_url: foto,
              fotos_adicionais: fotosML.length > 1 ? fotosML.slice(1) : [],
              marca_id: defaultBrand.id,
              ativo: status === 'active',
              inventory: {
                create: { quantidade_atual: quantidade, quantidade_minima: 5 },
              },
            },
          })
          productId = novo.id
          result.criados++
        }

        // 4) Salvar/atualizar listing do ML
        // Detectar tipo: "gold_special" (catálogo) vs "gold_pro" ou "free" (tradicional)
        const listingType = item.listing_type_id || (item.catalog_listing ? 'catalog' : 'traditional')
        const condition = item.condition || 'new'
        const modoCompra = item.buying_mode || 'buy_it_now'
        const dataCriacao = item.start_time ? new Date(item.start_time) : null
        const tags = (item.tags || []).filter((t: string) => t && t.length > 0)

        // Promoção (campo promotion: { type, start_date, end_date, price, etc })
        const prom = item.promotion || null
        const precoPromocional = prom?.price ? Number(prom.price) : null
        const promocaoInicio = prom?.start_date ? new Date(prom.start_date) : null
        const promocaoFim = prom?.end_date ? new Date(prom.end_date) : null
        const promocaoTipo = prom?.type || null
        const promocaoId = prom?.id || null

        // Frete grátis e Mercado Envios Full
        const freteGratis = Array.isArray(item.shipping?.tags) && item.shipping.tags.includes('self_service_in')
        const envioFull = Array.isArray(item.shipping?.tags) && item.shipping.tags.includes('fulfillment')

        await prisma.marketplace_listings.upsert({
          where: {
            account_id_listing_id: {
              account_id: accountId,
              listing_id: itemId,
            },
          },
          update: {
            product_id: productId,
            status,
            preco_atual: preco,
            preco_original: item.base_price || preco,
            preco_promocional: precoPromocional,
            promocao_inicio: promocaoInicio,
            promocao_fim: promocaoFim,
            promocao_tipo: promocaoTipo,
            promocao_id_ml: promocaoId,
            frete_gratis: freteGratis,
            envio_full: envioFull,
            stock_disponivel_ml: item.available_quantity,
            vendas_total: item.sold_quantity || 0,
            views_total: 0,
            listing_type: listingType,
            health: item.health || null,
            condition,
            modo_compra: modoCompra,
            categoria_id_ml: categoriaML,
            data_criacao_ml: dataCriacao,
            tags,
            last_sync_at: new Date(),
          },
          create: {
            product_id: productId,
            account_id: accountId,
            listing_id: itemId,
            permalink: item.permalink,
            status,
            preco_atual: preco,
            preco_original: item.base_price || preco,
            preco_promocional: precoPromocional,
            promocao_inicio: promocaoInicio,
            promocao_fim: promocaoFim,
            promocao_tipo: promocaoTipo,
            promocao_id_ml: promocaoId,
            frete_gratis: freteGratis,
            envio_full: envioFull,
            stock_disponivel_ml: item.available_quantity,
            vendas_total: item.sold_quantity || 0,
            listing_type: listingType,
            health: item.health || null,
            condition,
            modo_compra: modoCompra,
            categoria_id_ml: categoriaML,
            data_criacao_ml: dataCriacao,
            tags,
            last_sync_at: new Date(),
          },
        })

        // 5) Salvar/atualizar preço no canal ML
        if (account.company_id) {
          await prisma.product_prices.upsert({
            where: {
              product_id_canal_company_id: {
                product_id: productId,
                canal: 'mercado_livre',
                company_id: account.company_id,
              },
            },
            update: { preco_venda: preco },
            create: {
              product_id: productId,
              canal: 'mercado_livre',
              company_id: account.company_id,
              preco_venda: preco,
              custo: preco * 0.55, // estimativa inicial
            },
          })

          // 5b) Salvar snapshot no histórico de preço (só se mudou mais de 1%)
          const latest = await prisma.price_history.findFirst({
            where: { product_id: productId, canal: 'mercado_livre' },
            orderBy: { created_at: 'desc' },
          })
          const lastPreco = latest ? Number(latest.preco) : 0
          if (!lastPreco || Math.abs(preco - lastPreco) / Math.max(preco, lastPreco) > 0.01) {
            await prisma.price_history.create({
              data: {
                product_id: productId,
                canal: 'mercado_livre',
                company_id: account.company_id,
                preco,
                motivo: 'Sync automático ML',
              },
            })
          }
        }
      } catch (err: any) {
        result.erros.push(`Item ${itemId}: ${err.message}`)
      }
    }

    // 3) Processar em batches paralelos (5 por vez, menos conexões pra não estourar pool)
    const BATCH_SIZE = 5
    const totalBatches = Math.ceil(itemIds.length / BATCH_SIZE)
    for (let i = 0; i < itemIds.length; i += BATCH_SIZE) {
      const batch = itemIds.slice(i, i + BATCH_SIZE)
      await Promise.all(batch.map(processItem))
      const batchNum = Math.floor(i / BATCH_SIZE) + 1
      console.log(`[ML Sync] Batch ${batchNum}/${totalBatches} processado`)
      // Atualizar progresso no banco
      try {
        await prisma.marketplace_accounts.update({
          where: { id: accountId },
          data: {
            sync_progress: {
              etapa: `processando ${batchNum}/${totalBatches}`,
              pct: Math.round((batchNum / totalBatches) * 100),
              criados: result.criados,
              atualizados: result.atualizados,
            },
          },
        })
      } catch {}
    }

    // Atualizar última sync
    await prisma.marketplace_accounts.update({
      where: { id: accountId },
      data: { ultima_sincronizacao: new Date() },
    })

    return result
  } catch (err: any) {
    console.error('[ML Sync Products]', err)
    throw err
  }
}

// =====================================================
// 2) SINCRONIZAR PEDIDOS (ML → SISTEMA) + BAIXAR ESTOQUE
// =====================================================
export async function syncOrdersFromML(
  accountId: string,
  options: { days?: number; all?: boolean; limit?: number } = {}
): Promise<{
  total: number
  criados: number
  erros: string[]
}> {
  const days = options.days ?? 7
  const all = options.all ?? false
  const maxItems = options.limit ?? 100
  const account = await prisma.marketplace_accounts.findUnique({
    where: { id: accountId },
  })

  if (!account) throw new Error('Conta não encontrada')

  const result = { total: 0, criados: 0, erros: [] as string[] }

  try {
    // 1) Buscar pedidos recentes (com paginação)
    const dateFrom = days ? new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString() : undefined
    const allOrders: any[] = []
    let offset = 0
    const pageSize = 50
    do {
      const params = new URLSearchParams({
        seller: String(account.account_id),
        order_status: 'paid',
        sort: 'date_desc',
        limit: String(pageSize),
        offset: String(offset),
      })
      if (dateFrom) params.append('order_date_from', dateFrom)

      const ordersRes = await mlFetch(accountId, `/orders/search?${params.toString()}`)
      const batch: any[] = ordersRes.results || []
      allOrders.push(...batch)
      offset += pageSize
      if (allOrders.length >= maxItems) {
        allOrders.length = maxItems
        break
      }
      if (batch.length < pageSize) break
    } while (true)

    const orders = allOrders
    result.total = orders.length
    console.log(`[ML Sync Orders] Encontrados ${orders.length} pedidos`)

    for (const order of orders) {
      try {
        // Verificar se já existe no banco
        const existing = await prisma.orders.findFirst({
          where: {
            marketplace_account_id: accountId,
            // O ML tem o ID do pedido, mas não temos esse campo direto
            // Usar payment_id como fallback
            payment_id: String(order.id),
          },
        })

        if (existing) continue // já sincronizado

        // 2) Buscar detalhes completos
        const orderDetail: any = await mlFetch(accountId, `/orders/${order.id}`)

        // 3) Criar pedido no sistema
        // 3a) Pegar frete REAL do shipment (pode ser diferente de orderDetail.shipping_cost)
        const shipping = orderDetail.shipping || {}
        let freteML = Number(orderDetail.shipping_cost || 0)
        let bonusML = 0
        let shipmentDetail: any = null
        let tipoEnvio: string | null = null
        let custoFlexBase = 0 // base_cost do shipment (o que o vendedor paga ao carrier em FLEX)
        let bonusEnvio = 0    // base_cost - list_cost (devolvido pelo ML como "Bônus por envio")
        if (shipping.id) {
          try {
            shipmentDetail = await mlFetch(accountId, `/shipments/${shipping.id}`)
            // TIPO DE ENVIO: vem do shipment (não do listing!)
            // 'fulfillment' = FULL, 'self_service' = FLEX, 'me2'/'me1' = Mercado Envios
            tipoEnvio = shipmentDetail?.logistic_type || null
            const opt = shipmentDetail?.shipping_option || shipmentDetail?.shipping_options
            const optCost = opt?.list_cost ?? opt?.cost
            const optCostNum = optCost != null ? Number(optCost) : null

            // Bônus por envio: SÓ se aplica em FLEX (self_service).
            // FULL/cross/agency: ML desconta frete direto (sender.cost) e NÃO repassa bônus_envio.
            // Para esses tipos, ML pode estornar via cupom (sender.save = cupom implícito), NÃO como bonus_envio.
            // Custo FLEX = base_cost do shipment (o que o vendedor REALMENTE paga ao carrier)
            if (shipmentDetail?.base_cost != null) {
              custoFlexBase = Number(shipmentDetail.base_cost)
            }
            if (tipoEnvio === 'self_service' && custoFlexBase > 0 && optCostNum != null && optCostNum > 0) {
              bonusEnvio = Math.max(0, custoFlexBase - optCostNum)
            }

            // FRETE REAL: depende do tipo_envio.
            // - FLEX (self_service): list_cost é 0 ou ausente — ML não desconta frete (vendedor paga carrier à parte via custo_flex).
            // - FULL: ML desconta frete (sender.cost) do receb do seller.
            // - cross_docking/xd_dropoff/agency: list_cost é o consolidado (inclui pagamento do buyer),
            //   mas o que SELLER paga é sender.cost. Validado: 77,50 - 9,30 - 7,85 + 4,65 = 65,00.
            // Pra cross/agency, busca /shipments/{id}/costs pra pegar sender.cost real.
            if (tipoEnvio === 'self_service') {
              // FLEX: frete = 0 (passa pelo seller via bonus_envio/custo_flex)
              freteML = 0
            } else if (tipoEnvio === 'fulfillment') {
              // FULL: usar list_cost se > 0 (já é o que ML desconta)
              if (optCostNum != null && optCostNum > 0) freteML = optCostNum
              else if (shipmentDetail?.shipping_cost != null) freteML = Number(shipmentDetail.shipping_cost)
              else if (shipmentDetail?.base_cost != null) freteML = Number(shipmentDetail.base_cost)
            } else {
              // cross_docking / xd_dropoff / agency: precisa de /shipments/{id}/costs pra sender.cost
              try {
                const costsResp: any = await mlFetch(accountId, `/shipments/${shipping.id}/costs`)
                const senderCost = costsResp?.senders?.[0]?.cost
                if (senderCost != null) {
                  freteML = Number(senderCost)
                } else if (optCostNum != null && optCostNum > 0) {
                  // fallback: list_cost (pode estar errado em alguns casos mas é melhor que nada)
                  freteML = optCostNum
                }
              } catch {
                if (optCostNum != null && optCostNum > 0) freteML = optCostNum
              }
            }

            // Bonus/cupom vem do shipment (não do order diretamente)
            if (shipmentDetail?.coupon?.amount != null) {
              bonusML = Number(shipmentDetail.coupon.amount)
            }
          } catch (e) {
            // mantém frete do orderDetail
          }
        }

        // 3b) Comissão REAL do ML (sale_fee por item, NÃO % calculada)
        let comissaoTotal = 0
        let tarifaCheiaTotal = 0 // pra detectar bônus implícito
        const itemsComComissao = orderDetail.order_items.map((item: any) => {
          const precoUnitario = Number(item.unit_price || 0)
          const precoTotal = precoUnitario * Number(item.quantity || 1)
          const qtd = Number(item.quantity || 1)
          // sale_fee é por item unitário no ML; multiplica por quantidade
          const saleFeeUnit = Number(item.sale_fee || 0)
          const comissaoItem = saleFeeUnit * qtd
          comissaoTotal += comissaoItem
          // Tarifa cheia (12%) — se for maior que sale_fee, diferença é bônus implícito
          tarifaCheiaTotal += precoTotal * 0.12
          return { item, precoUnitario, precoTotal, comissaoItem, saleFeeUnit }
        })

        // 3c) Bonus do payment + bonus implícito (diferença entre 12% cheio e sale_fee)
        try {
          if (Array.isArray(orderDetail.payments)) {
            for (const p of orderDetail.payments) {
              if (p.coupon_amount && Number(p.coupon_amount) > 0) {
                bonusML += Number(p.coupon_amount)
              }
            }
          }
        } catch {}
        // Se tiver tag order_has_discount e tarifaCheia > comissaoTotal, diferença é bônus implícito
        const tags = orderDetail.tags || []
        if (Array.isArray(tags) && tags.includes('order_has_discount')) {
          const bonusImplicito = Math.max(0, tarifaCheiaTotal - comissaoTotal)
          if (bonusImplicito > bonusML) bonusML = bonusImplicito
        }

        // 3d) Recebimento líquido = total - comissão - frete + bônus_envio
        // IMPORTANTE: sale_fee do ML JÁ desconta o bônus implícito (cupom),
        // mas NÃO desconta o "bônus por envio" (que vem do shipment base_cost - list_cost).
        // Adicionamos bonusEnvio aqui pra refletir o TOTAL real que o ML transfere.
        const recebimentoLiquido = Math.max(
          0,
          Number(orderDetail.total_amount || 0) - comissaoTotal - freteML + bonusEnvio
        )

        // 3d) Mapear status ML → nosso enum
        const statusML = orderDetail.status || 'paid'
        const statusMap: Record<string, 'pendente' | 'confirmado' | 'separado' | 'enviado' | 'entregue' | 'cancelado' | 'devolvido'> = {
          paid: 'confirmado',
          handling: 'separado',
          ready_to_ship: 'separado',
          shipped: 'enviado',
          delivered: 'entregue',
          cancelled: 'cancelado',
        }
        const statusInterno: 'pendente' | 'confirmado' | 'separado' | 'enviado' | 'entregue' | 'cancelado' | 'devolvido' = statusMap[statusML] || 'confirmado'

        // 3e) Lookup de product_id por listing_id (pra vincular o item ao produto e permitir JOIN com product_prices/custos)
        // IMPORTANTE multi-tenant: NÃO filtrar por account_id — a conta parceira (ex: COSMARI) não tem
        // marketplace_listings próprios ainda, mas os listing_ids são únicos no ML e o product_id é o que importa.
        // O mesmo produto tem listing_ids DIFERENTES em contas diferentes, mas o product_id é compartilhado no nosso DB.
        const mlItemIds = orderDetail.order_items.map((it: any) => it.item.id).filter(Boolean)
        const listingsForItems = mlItemIds.length > 0
          ? await prisma.marketplace_listings.findMany({
              where: { listing_id: { in: mlItemIds } },
              select: { listing_id: true, product_id: true },
            })
          : []
        const listingMap = new Map(listingsForItems.map((l) => [l.listing_id, l.product_id]))

        // 3e.2) Lookup do custo REAL por product_id (canal=mercado_livre)
        // Evita gravar estimativa 55% do preço (que distorce CMV/margem)
        const productIds = Array.from(new Set(listingsForItems.map((l) => l.product_id).filter(Boolean)))
        const productCosts = productIds.length > 0
          ? await prisma.product_prices.findMany({
              where: { product_id: { in: productIds }, canal: 'mercado_livre' },
              select: { product_id: true, custo: true },
            })
          : []
        const costMap = new Map(productCosts.map((p) => [p.product_id, p.custo ? Number(p.custo.toString()) : null]))

        const newOrder = await prisma.orders.create({
          data: {
            order_number: String(order.id),
            // pack_id: agrupamento de vendas do mesmo envio (ML mostra esse na listagem principal)
            pack_id: orderDetail.pack_id ? String(orderDetail.pack_id) : null,
            origem: 'mercado_livre',
            company_id: account.company_id || '',
            marketplace_account_id: accountId,
            customer_id: null,
            status: statusInterno,
            // 🔑 Data REAL de venda do ML (não timestamp de importação)
            created_at: orderDetail.date_created ? new Date(orderDetail.date_created) : new Date(),
            subtotal: orderDetail.total_amount - freteML,
            frete: freteML,
            total: orderDetail.total_amount,
            comissao_seller_valor: comissaoTotal,
            comissao_seller_pct: comissaoTotal > 0 && orderDetail.total_amount > 0
              ? (comissaoTotal / orderDetail.total_amount) * 100
              : 0,
            recebimento_liquido: recebimentoLiquido,
            // Salvar bônus/desconto de campanha comercial (soma na margem)
            desconto: bonusML > 0 ? bonusML : null,
            // Tipo de envio (vem do shipment.logistic_type)
            tipo_envio: tipoEnvio,
            // custo_flex NÃO vem do shipment (user paga R$13,90 ao carrier, não o base_cost do ML).
            // Deixa null — o padrão R$13,90 é aplicado em vendas-recentes.
            custo_flex: null,
            // Decomposição da comissão (pra tooltip no painel)
            // - bonus_envio_valor: bônus por envio (= base_cost - list_cost)
            // - bonus_cupom_valor: cupom + bônus implícito (= orders.desconto - bonus_envio)
            // - tarifa_pct_valor: tarifa cheia de 12% (= total * 0.12)
            // - tarifa_fixa_valor: custo fixo ML (= sale_fee + bonus_cupom - tarifa_pct_valor)
            bonus_envio_valor: bonusEnvio > 0 ? bonusEnvio : null,
            bonus_cupom_valor:
              bonusML > 0
                ? Math.max(0, bonusML - bonusEnvio)
                : null,
            tarifa_pct_valor: Math.round(orderDetail.total_amount * 0.12 * 100) / 100,
            tarifa_fixa_valor:
              orderDetail.total_amount && Number(orderDetail.total_amount) > 0 && bonusML >= 0
                ? Math.max(
                    0,
                    Math.round(
                      (comissaoTotal + Math.max(0, bonusML - bonusEnvio) - Number(orderDetail.total_amount) * 0.12) *
                        100
                    ) / 100
                  )
                : null,
            // Total pago pelo buyer (inclui cupons). Diferença = bônus total devolvido pelo ML
            total_paid_amount:
              Array.isArray(orderDetail.payments) && orderDetail.payments[0]
                ? Number(orderDetail.payments[0].total_paid_amount || orderDetail.payments[0].transaction_amount)
                : null,
            payment_id: String(order.id),
            forma_pagamento: 'Mercado Pago',
            pago_em: orderDetail.date_closed ? new Date(orderDetail.date_closed) : null,
            endereco_entrega: shipping.receiver_address || {},
            // Salvar itens VINCULADOS ao produto (lookup via marketplace_listings)
            order_items: {
              create: itemsComComissao.map(({ item, precoUnitario, precoTotal }) => {
                const productId = listingMap.get(item.item.id) || null
                // Custo: prioriza product_prices.custo (real); se não tiver, grava NULL
                // NUNCA usar estimativa 55% — gera valores aproximados (ex: 41,34 em vez de 50)
                // que poluem as finanças. Em vez disso, deixa NULL e alerta via /admin/sync-custo-items
                const custoReal = productId ? costMap.get(productId) : null
                return {
                  product_id: productId,
                  sku: item.item.seller_custom_field || item.item.id,
                  nome_produto: item.item.title,
                  foto_url: item.item.thumbnail,
                  quantidade: item.quantity,
                  preco_unitario: precoUnitario,
                  preco_total: precoTotal,
                  // Custo arredondado pra 2 casas decimais (evita 41.3435 virar 41.34 com floating point)
                  custo_unitario: custoReal != null && custoReal > 0
                    ? Math.round(custoReal * 100) / 100
                    : null, // null se não tem custo real cadastrado (era 55% antes — REMOVIDO)
                }
              }),
            },
          },
        })

        // 4) Baixar estoque de cada item
        for (const item of orderDetail.order_items) {
          const sku = item.item.seller_custom_field || item.item.id

          // Encontrar o produto pelo SKU ou listing
          const listing = await prisma.marketplace_listings.findFirst({
            where: { listing_id: item.item.id, account_id: accountId },
          })

          if (listing?.product_id) {
            const inv = await prisma.inventory.findFirst({
              where: { product_id: listing.product_id },
            })
            if (inv) {
              await prisma.inventory.update({
                where: { id: inv.id },
                data: {
                  quantidade_atual: Math.max(0, inv.quantidade_atual - item.quantity),
                  ultima_saida: new Date(),
                },
              })
            }
          }
        }

        result.criados++
      } catch (err: any) {
        result.erros.push(`Pedido ${order.id}: ${err.message}`)
      }
    }

    return result
  } catch (err: any) {
    console.error('[ML Sync Orders]', err)
    throw err
  }
}

// =====================================================
// 3) ATUALIZAR ESTOQUE (SISTEMA → ML)
// =====================================================
export async function pushStockToML(accountId: string, productId: string): Promise<boolean> {
  // Buscar o listing do ML pra esse produto
  const listing = await prisma.marketplace_listings.findFirst({
    where: { product_id: productId, account_id: accountId },
  })

  if (!listing) {
    throw new Error('Produto não está listado no ML desta conta')
  }

  // Buscar estoque atual
  const inv = await prisma.inventory.findFirst({
    where: { product_id: productId },
  })

  if (!inv) throw new Error('Sem registro de estoque')

  // Atualizar no ML via API
  await mlFetch(accountId, `/items/${listing.listing_id}`, {
    method: 'PUT',
    body: JSON.stringify({
      available_quantity: inv.quantidade_atual,
    }),
  })

  return true
}
