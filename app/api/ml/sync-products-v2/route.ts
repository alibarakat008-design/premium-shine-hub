/**
 * API: Sincronizar produtos do Mercado Livre (sem duplicar)
 * POST /api/ml/sync-products-v2
 *   Body: { account_id? }
 *
 * Puxa todos os listings da conta ML e:
 * - Se o listing não tem product_id: busca/cria o product
 * - Atualiza preço, estoque, status do listing
 * - NÃO duplica produtos existentes (busca por SKU seller_custom_field ou por listing_id)
 *
 * Retorna progresso em tempo real (mas como serverless, é síncrono)
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const maxDuration = 300
export const fetchCache = 'force-no-store'

const ML_API_BASE = 'https://api.mercadolibre.com'

async function refreshToken(accountId: string): Promise<string> {
  const acc = await prisma.marketplace_accounts.findUnique({ where: { id: accountId } })
  if (!acc) throw new Error('Conta não encontrada')
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: process.env.ML_CLIENT_ID!,
    client_secret: process.env.ML_CLIENT_SECRET!,
    refresh_token: acc.refresh_token!,
  })
  const res = await fetch(`${ML_API_BASE}/oauth/token`, { method: 'POST', body: params })
  const data = await res.json()
  if (!data.access_token) throw new Error('Falha no refresh: ' + JSON.stringify(data))
  const tokenExpira = new Date(Date.now() + (data.expires_in || 21600) * 1000)
  await prisma.marketplace_accounts.update({
    where: { id: accountId },
    data: { access_token: data.access_token, refresh_token: data.refresh_token, token_expira_em: tokenExpira },
  })
  return data.access_token
}

async function getValidToken(accountId: string): Promise<string> {
  const acc = await prisma.marketplace_accounts.findUnique({ where: { id: accountId } })
  if (!acc) throw new Error('Conta não encontrada')
  const expiraEm = acc.token_expira_em ? new Date(acc.token_expira_em).getTime() : 0
  if (Date.now() > expiraEm - 5 * 60000) {
    return await refreshToken(accountId)
  }
  return acc.access_token!
}

async function mlFetch(accountId: string, path: string): Promise<any> {
  const token = await getValidToken(accountId)
  const res = await fetch(`${ML_API_BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`ML ${res.status}: ${txt.slice(0, 200)}`)
  }
  return res.json()
}

async function ensureBrand(nome: string): Promise<string | null> {
  if (!nome) return null
  const existing = await prisma.brands.findFirst({ where: { nome: { equals: nome, mode: 'insensitive' } } })
  if (existing) return existing.id
  try {
    const b = await prisma.brands.create({ data: { nome } })
    return b.id
  } catch {
    const e = await prisma.brands.findFirst({ where: { nome: { equals: nome, mode: 'insensitive' } } })
    return e?.id
  }
}

async function ensureCategory(nome: string): Promise<string | null> {
  if (!nome) return null
  const existing = await prisma.categories.findFirst({ where: { nome: { equals: nome, mode: 'insensitive' } } })
  if (existing) return existing.id
  const slug = nome.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 100)
  try {
    const c = await prisma.categories.create({ data: { nome, slug, ativa: true } })
    return c.id
  } catch {
    const e = await prisma.categories.findUnique({ where: { slug } })
    return e?.id
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const accountIdFiltro = body.account_id
    const plataforma = body.plataforma || 'mercado_livre'

    // Buscar contas
    const accounts = await prisma.marketplace_accounts.findMany({
      where: {
        plataforma,
        ativa: true,
        ...(accountIdFiltro ? { id: accountIdFiltro } : {}),
      },
    })

    if (accounts.length === 0) {
      return NextResponse.json({ success: false, error: 'Nenhuma conta ML ativa' }, { status: 400 })
    }

    const total = { criados: 0, atualizados: 0, erros: 0, listings_atualizados: 0 }

    for (const account of accounts) {
      const userId = account.account_id
      let offset = 0
      const limit = 50

      while (true) {
        const search = await mlFetch(account.id, `/users/${userId}/items/search?limit=${limit}&offset=${offset}`).catch(() => null)
        if (!search) break
        const ids: string[] = search.results || []
        if (ids.length === 0) break

        // Batch detalhes
        const items: any[] = []
        for (let i = 0; i < ids.length; i += 20) {
          const batch = ids.slice(i, i + 20)
          const multi = await mlFetch(account.id, `/items?ids=${batch.join(',')}`).catch(() => [])
          for (const r of multi || []) {
            if (r.code === 200 && r.body) items.push(r.body)
          }
        }

        for (const item of items) {
          try {
            const mlId = item.id
            const titulo = (item.title || 'Sem título').substring(0, 255)
            const preco = Number(item.price || 0)
            const estoqueML = Number(item.available_quantity || 0)
            const sku = item.seller_custom_field || `ML-${mlId}`
            const health = Math.round(Number(item.health || 1) * 100)
            const vendas = Number(item.sold_quantity || 0)

            // Verificar se listing já existe
            let listing = await prisma.marketplace_listings.findFirst({
              where: { listing_id: mlId },
              include: { products: true },
            })

            // Verificar se product existe (por SKU)
            let product = await prisma.products.findUnique({ where: { sku } })

            if (!product) {
              // Marca
              const marcaMatch = titulo.match(/^([A-Z][A-Z\s]{2,15})/)
              const marcaId = marcaMatch ? await ensureBrand(marcaMatch[1].trim()) : null

              // Categoria ML
              const categoriaML = item.category_id
              const categoriaId = categoriaML ? await ensureCategory(`ML-${categoriaML}`) : null

              // Volume
              const volumeMatch = titulo.match(/(\d+)\s?(ml|ML|g|GR|kg|un|unidades?)/i)
              const volume = volumeMatch ? volumeMatch[0] : null

              // Foto
              const foto = item.secure_thumbnail || item.thumbnail || null

              // EAN
              const ean = item.attributes?.find((a: any) => a.id === 'EAN' || a.id === 'GTIN')?.value_name || null

              // Criar product
              product = await prisma.products.create({
                data: {
                  sku,
                  nome: titulo,
                  ean,
                  marca_id: marcaId,
                  categoria_id: categoriaId,
                  volume,
                  descricao_curta: titulo.substring(0, 200),
                  foto_principal_url: foto,
                  ativo: true,
                },
              })
              // Inventory zerado
              await prisma.inventory.create({
                data: { product_id: product.id, quantidade_atual: 0, quantidade_minima: 5, quantidade_maxima: 100, custo_medio: 0 },
              })
              total.criados++
            } else {
              total.atualizados++
              // Atualizar foto/nome
              await prisma.products.update({
                where: { id: product.id },
                data: {
                  nome: titulo,
                  foto_principal_url: item.secure_thumbnail || item.thumbnail || product.foto_principal_url,
                  ativo: true,
                },
              })
            }

            if (!listing) {
              await prisma.marketplace_listings.create({
                data: {
                  account_id: account.id,
                  product_id: product.id,
                  listing_id: mlId,
                  permalink: item.permalink,
                  status: item.status || 'active',
                  preco_atual: preco,
                  preco_original: preco,
                  listing_type: item.listing_type_id || 'gold_pro',
                  health,
                  condition: item.condition || 'new',
                  modo_compra: item.buying_mode || 'buy_it_now',
                  categoria_id_ml: item.category_id,
                  stock_disponivel_ml: estoqueML,
                  vendas_total: vendas,
                  last_sync_at: new Date(),
                },
              })
            } else {
              // Atualizar listing
              await prisma.marketplace_listings.update({
                where: { id: listing.id },
                data: {
                  product_id: product.id,
                  permalink: item.permalink,
                  status: item.status,
                  preco_atual: preco,
                  health,
                  condition: item.condition || listing.condition,
                  stock_disponivel_ml: estoqueML,
                  vendas_total: vendas,
                  last_sync_at: new Date(),
                },
              })
            }
            total.listings_atualizados++
          } catch (err: any) {
            total.erros++
            console.error(`Erro item ${item.id}: ${err.message?.slice(0, 100)}`)
          }
        }

        offset += limit
        if (ids.length < limit) break
        if (offset > 1000) break
      }

      // Atualizar última sincronização
      await prisma.marketplace_accounts.update({
        where: { id: account.id },
        data: { ultima_sincronizacao: new Date(), sync_status: 'completed' },
      })
    }

    return NextResponse.json({
      success: true,
      message: `Sincronização concluída!`,
      data: {
        total: total.listings_atualizados,
        criados: total.criados,
        atualizados: total.atualizados,
        erros: total.erros,
        pct: 100,
      },
    })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message, stack: err.stack }, { status: 500 })
  }
}
