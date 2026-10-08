// /app/api/admin/produtos-fotos/route.ts
// GET: lista produtos com fotos e filtros (brand_id, busca)
// PUT: atualiza fotos em bulk
// Via Prisma direto (sem Management API)
import { NextRequest, NextResponse } from 'next/server'
import { isMatrizRequest } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// GET — listar produtos com filtro
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const busca = searchParams.get('busca') || ''
    const brand_id = searchParams.get('brand_id') || ''
    const limit = Number(searchParams.get('limit') || 500)

    const products = await prisma.products.findMany({
      where: {
        ...(brand_id ? { marca_id: brand_id } : {}),
        ...(busca ? {
          OR: [
            { nome: { contains: busca, mode: 'insensitive' } },
            { sku: { contains: busca, mode: 'insensitive' } },
          ],
        } : {}),
      },
      include: {
        brands: { select: { id: true, nome: true } },
        inventory: { select: { quantidade_atual: true } },
        product_prices: { select: { canal: true, preco_venda: true, custo: true } },
        marketplace_listings: {
          select: { listing_id: true },
          take: 1,
        },
      },
      take: limit,
      orderBy: { nome: 'asc' },
    })

    const result = products.map(p => {
      const listing = p.marketplace_listings?.[0]
      // Extrai notas olfativas do JSON se existir
      const notasJson = p.notas_olfativas as any
      const fotoUrl = (p.foto_principal_url && p.foto_principal_url.startsWith('http'))
        ? p.foto_principal_url
        : p.foto_principal_url

      return {
        id: p.id,
        sku: p.sku,
        ean: p.ean,
        nome: p.nome,
        volume: p.volume,
        genero: p.genero,
        foto_principal_url: fotoUrl,
        fotos_adicionais: p.fotos_adicionais,
        notas_top: notasJson?.top || null,
        notas_coracao: notasJson?.coracao || notasJson?.heart || null,
        notas_fundo: notasJson?.fundo || notasJson?.base || null,
        ml_ids: listing?.listing_id ? [listing.listing_id] : null,
        brands: p.brands ? { id: p.brands.id, nome: p.brands.nome } : null,
        inventory: { quantidade_atual: p.inventory?.quantidade_atual ?? 0 },
        product_prices: p.product_prices.map(pr => ({ canal: pr.canal, preco_venda: pr.preco_venda, custo: pr.custo })),
        ml_listing_id: listing?.listing_id || null,
        kit_of: [],
        kit_components: [],
        vendas_total: 0,
      }
    })

    return NextResponse.json({ ok: true, total: result.length, products: result })
  } catch (err: any) {
    console.error('[produtos-fotos GET]', err)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

// PUT — atualizar fotos em bulk via Prisma
export async function PUT(req: NextRequest) {
  if (!isMatrizRequest(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const body = await req.json()
    const { updates } = body

    if (!Array.isArray(updates) || updates.length === 0) {
      return NextResponse.json({ ok: false, error: 'updates deve ser um array' }, { status: 400 })
    }

    const results = []
    for (const u of updates) {
      if (!u.id) continue
      try {
        await prisma.products.update({
          where: { id: u.id },
          data: {
            ...(u.foto_principal_url !== undefined ? { foto_principal_url: u.foto_principal_url || null } : {}),
            ...(u.fotos_adicionais !== undefined ? { fotos_adicionais: u.fotos_adicionais || [] } : {}),
            updated_at: new Date(),
          },
        })
        results.push({ ok: true, id: u.id })
      } catch (e: any) {
        results.push({ ok: false, id: u.id, error: e.message })
      }
    }

    const sucessos = results.filter((r: any) => r.ok).length
    const erros = results.filter((r: any) => !r.ok).length

    return NextResponse.json({ ok: true, atualizados: sucessos, erros, results })
  } catch (err: any) {
    console.error('[produtos-fotos PUT]', err)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
