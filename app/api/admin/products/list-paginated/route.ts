/**
 * Lista produtos COM custo por canal, com paginação, busca e filtro "só sem custo".
 *
 * GET /api/admin/products/list-paginated?canal=mercado_livre&missing=0&search=ASAD&page=1&pageSize=50
 *
 * Response:
 *   { ok, total, page, pageSize, items: [{ sku, nome, custo, preco_venda, marca }] }
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || ''
    if (!authHeader.startsWith('Basic ')) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }
    const { searchParams } = new URL(req.url)
    const canal = searchParams.get('canal') || 'mercado_livre'
    const missing = searchParams.get('missing') === '1' || searchParams.get('missing') === 'true'
    const search = (searchParams.get('search') || '').trim()
    const page = Math.max(1, Number(searchParams.get('page') || 1))
    const pageSize = Math.min(500, Math.max(10, Number(searchParams.get('pageSize') || 50)))

    // Filtra produtos ativos; LEFT JOIN com product_prices do canal
    // Pra "missing=true": só produtos SEM custo OU custo=0
    const where: any = { ativo: true }
    if (search) {
      where.OR = [
        { sku: { contains: search, mode: 'insensitive' } },
        { nome: { contains: search, mode: 'insensitive' } },
      ]
    }

    // Busca TODOS os produtos do filtro e pagina client-side de acordo com o JOIN,
    // porque queremos filtrar missing após o JOIN.
    const all = await prisma.products.findMany({
      where,
      select: {
        id: true,
        sku: true,
        nome: true,
        brands: { select: { nome: true } },
        product_prices: {
          where: { canal: canal as any },
          select: { custo: true, preco_venda: true },
          take: 1,
        },
      },
      orderBy: { nome: 'asc' },
      // Sem take/limit: vamos paginar DEPOIS de filtrar missing
      // Para 660 produtos isso é OK em memória.
    })

    // Enriquece com custo
    const enriched = all.map((p) => ({
      sku: p.sku,
      nome: p.nome,
      marca: p.brands?.nome || '',
      custo: p.product_prices?.[0]?.custo ? Number(p.product_prices[0].custo) : 0,
      preco_venda: p.product_prices?.[0]?.preco_venda ? Number(p.product_prices[0].preco_venda) : 0,
      has_price: !!p.product_prices?.[0],
    }))

    // Filtra missing (se pedido)
    const filtered = missing ? enriched.filter((p) => p.custo <= 0) : enriched

    const total = filtered.length
    const start = (page - 1) * pageSize
    const items = filtered.slice(start, start + pageSize)

    return NextResponse.json({
      ok: true,
      total,
      page,
      pageSize,
      hasMore: start + pageSize < total,
      canal,
      missing,
      search,
      items,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}