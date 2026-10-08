import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getMLToken } from '@/lib/ml-auth-multi'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 120

/**
 * GET /api/admin/atualizar-produtos?company_id=X&dias=7
 *
 * Atualiza dados dos produtos via ML:
 * - Preço atual
 * - Estoque disponível
 * - Status (active/paused)
 * - Quantidade vendida
 * - Health
 *
 * Útil quando:
 * - ML tem preço/estoque novo
 * - DB tá desatualizado
 * - Refresh após pausa/reativação
 *
 * Retorna: { ok, total, atualizados, erros, error_samples }
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const companyId = searchParams.get('company_id') || null
    const limite = Number(searchParams.get('limit') || 200)
    const dias = Number(searchParams.get('dias') || 7)

    // Token
    const tokenRes = await getMLToken(companyId || undefined)
    if (!tokenRes?.token) {
      return NextResponse.json({ ok: false, error: 'Token ML indisponível' }, { status: 401 })
    }
    const token = tokenRes.token
    const sellerId = tokenRes.ml_user_id

    // 1) Lista todos listings do seller
    const listingsUrl = `https://api.mercadolibre.com/users/${sellerId}/items/search?limit=${limite}`
    const r = await fetch(listingsUrl, { headers: { Authorization: `Bearer ${token}` } })
    if (!r.ok) {
      const txt = await r.text()
      return NextResponse.json({ ok: false, error: `ML ${r.status}: ${txt.substring(0, 200)}` }, { status: 502 })
    }
    const data = await r.json()
    const itemIds: string[] = data.results || []
    console.log(`[atualizar-produtos] ${itemIds.length} listings`)

    // 2) Pra cada, pega detalhes (em batches de 20)
    const atualizados: any[] = []
    const erros: any[] = []

    for (let i = 0; i < itemIds.length; i += 20) {
      const batch = itemIds.slice(i, i + 20)
      const detailPromises = batch.map(id =>
        fetch(`https://api.mercadolibre.com/items/${id}`, { headers: { Authorization: `Bearer ${token}` } })
          .then(r => r.json()).catch(() => null)
      )
      const items = await Promise.all(detailPromises)

      for (const item of items) {
        if (!item || !item.id) continue
        try {
          // Upsert product
          const sku = item.id
          const nome = item.title || ''
          const custo = item.cost ? Number(item.cost) : 0
          const precoVenda = item.price ? Number(item.price) : 0
          const estoque = item.available_quantity || 0
          const ativo = item.status === 'active'
          const foto = item.secure_thumbnail || item.thumbnail || null

          // Find or create product (products não tem company_id/preco_venda/custo direto — usa product_prices)
          const existing = await prisma.products.findUnique({ where: { sku } })
          if (existing) {
            await prisma.products.update({
              where: { id: existing.id },
              data: {
                nome,
                ativo,
                foto_principal_url: foto,
                updated_at: new Date(),
              },
            })
            // Update price com company
            if (companyId) {
              await prisma.product_prices.upsert({
                where: {
                  product_id_canal_company_id: {
                    product_id: existing.id, canal: 'mercado_livre', company_id: companyId,
                  },
                } as any,
                create: {
                  product_id: existing.id, canal: 'mercado_livre', company_id: companyId,
                  preco_venda: precoVenda, custo,
                },
                update: { preco_venda: precoVenda, custo, updated_at: new Date() },
              })
            }
            atualizados.push({ id: existing.id, sku, preco: precoVenda, estoque, ativo })
          } else {
            // Cria novo
            const novo = await prisma.products.create({
              data: {
                sku, nome, ativo, foto_principal_url: foto,
                updated_at: new Date(),
                created_at: new Date(),
              },
            })
            if (companyId) {
              await prisma.product_prices.create({
                data: {
                  product_id: novo.id, canal: 'mercado_livre', company_id: companyId,
                  preco_venda: precoVenda, custo,
                },
              })
            }
            atualizados.push({ id: novo.id, sku, preco: precoVenda, estoque, ativo, novo: true })
          }
        } catch (e: any) {
          erros.push({ item: item.id, error: e.message })
        }
      }
    }

    return NextResponse.json({
      ok: true,
      total: itemIds.length,
      atualizados: atualizados.length,
      criados: atualizados.filter(a => a.novo).length,
      atualizados_list: atualizados.slice(0, 50),
      erros: erros.length,
      error_samples: erros.slice(0, 10),
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message, stack: e.stack }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}
