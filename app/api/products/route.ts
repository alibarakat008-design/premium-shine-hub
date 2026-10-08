/**
 * =====================================================
 * API DE PRODUTOS — Premium Shine Hub
 * =====================================================
 * Endpoints:
 *   GET    /api/products          — Listar com busca e filtros
 *   GET    /api/products/:id      — Buscar um produto
 *   POST   /api/products          — Criar novo produto
 *   PUT    /api/products/:id      — Atualizar produto
 *   DELETE /api/products/:id      — Deletar (soft delete)
 *   GET    /api/products/featured — Produtos em destaque
 *   GET    /api/products/low-stock — Alerta de estoque baixo
 *
 * Stack: Next.js 14 App Router + Prisma + Zod
 * =====================================================
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

// =====================================================
// SCHEMA DE VALIDAÇÃO (Zod)
// =====================================================
const ProductCreateSchema = z.object({
  sku: z.string().min(3).max(50),
  ean: z.string().max(20).optional().nullable(),
  nome: z.string().min(3).max(255),
  descricao_curta: z.string().max(500).optional().nullable(),
  descricao_completa: z.string().optional().nullable(),
  marca_id: z.string().uuid(),
  categoria_id: z.string().uuid().optional().nullable(),
  fornecedor_id: z.string().uuid().optional().nullable(),
  genero: z.enum(['masculino', 'feminino', 'unissex']).optional().nullable(),
  volume: z.string().max(50).optional().nullable(),
  ncm: z.string().max(20).optional().nullable(),
  notas_olfativas: z
    .object({
      familia: z.string().optional(),
      topo: z.string().optional(),
      coracao: z.string().optional(),
      base: z.string().optional(),
      inspiracao: z.string().optional(),
    })
    .optional()
    .nullable(),
  foto_principal_url: z.string().url().optional().nullable(),
  fotos_adicionais: z.array(z.string().url()).optional().nullable(),
  destaque: z.boolean().default(false),
  company_id: z.string().uuid().optional(), // CNPJ dono do produto
})

const ProductUpdateSchema = ProductCreateSchema.partial()

// =====================================================
// FILTROS DE BUSCA
// =====================================================
const ProductFiltersSchema = z.object({
  // Busca textual
  q: z.string().optional(),

  // Filtros categóricos
  marca_id: z.string().uuid().optional(),
  categoria_id: z.string().uuid().optional(),
  fornecedor_id: z.string().uuid().optional(),

  // Filtros de produto
  genero: z.enum(['masculino', 'feminino', 'unissex']).optional(),
  volume: z.string().optional(),
  ativo: z.boolean().optional(),
  destaque: z.boolean().optional(),

  // Filtros olfativos
  familia_olfativa: z.string().optional(),

  // Estoque
  em_estoque: z.boolean().optional(), // true = só com estoque > 0
  estoque_baixo: z.boolean().optional(), // true = estoque <= mínimo

  // Preço (BRL)
  preco_min: z.number().optional(),
  preco_max: z.number().optional(),

  // Lookup
  ean: z.string().optional(),

  // Ordenação
  order_by: z
    .enum(['nome', 'created_at', 'updated_at', 'sku', 'vendas', 'preco', 'estoque'])
    .default('vendas'),
  order_dir: z.enum(['asc', 'desc']).default('desc'),

  // Paginação
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
})

// =====================================================
// GET /api/products — Listar produtos (Management API, serverless-safe)
// =====================================================
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const SUPABASE_MANAGE_TOKEN = process.env.SUPABASE_MANAGE_TOKEN
    if (!SUPABASE_MANAGE_TOKEN) {
      return NextResponse.json({ success: false, error: 'SUPABASE_MANAGE_TOKEN not configured' }, { status: 500 })
    }

    // Parsear filtros
    const q = searchParams.get('q') || ''
    const marca_id = searchParams.get('marca_id') || ''
    const categoria_id = searchParams.get('categoria_id') || ''
    const fornecedor_id = searchParams.get('fornecedor_id') || ''
    const genero = searchParams.get('genero') || ''
    const volume = searchParams.get('volume') || ''
    const ativo = searchParams.get('ativo')
    const destaque = searchParams.get('destaque')
    const familia_olfativa = searchParams.get('familia_olfativa') || ''
    const em_estoque = searchParams.get('em_estoque')
    const estoque_baixo = searchParams.get('estoque_baixo')
    const preco_min = searchParams.get('preco_min') || ''
    const preco_max = searchParams.get('preco_max') || ''
    const ean = searchParams.get('ean') || ''
    const order_by = searchParams.get('order_by') || 'created_at'
    const order_dir = searchParams.get('order_dir') === 'asc' ? 'asc' : 'desc'
    const page = Math.max(1, parseInt(searchParams.get('page') || '1') || 1)
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '20') || 20))
    const offset = (page - 1) * limit

    // Build WHERE clauses — Management API uses direct interpolation (no $1 placeholders)
    const conditions: string[] = ['1=1']

    if (q) {
      const qe = q.replace(/'/g, "''")
      conditions.push(`(
        p.nome ILIKE '%${qe}%' OR
        p.sku ILIKE '%${qe}%' OR
        p.ean ILIKE '%${qe}%' OR
        p.descricao_curta ILIKE '%${qe}%'
      )`)
    }
    if (ean) { const e = ean.replace(/'/g, "''"); conditions.push(`p.ean = '${e}'`) }
    if (marca_id) { const m = marca_id.replace(/'/g, "''"); conditions.push(`p.marca_id = '${m}'`) }
    if (categoria_id) { const c = categoria_id.replace(/'/g, "''"); conditions.push(`p.categoria_id = '${c}'`) }
    if (fornecedor_id) { const f = fornecedor_id.replace(/'/g, "''"); conditions.push(`p.fornecedor_id = '${f}'`) }
    if (genero) { const g = genero.replace(/'/g, "''"); conditions.push(`p.genero = '${g}'`) }
    if (volume) { const v = volume.replace(/'/g, "''"); conditions.push(`p.volume ILIKE '%${v}%'`) }
    if (ativo === 'true') conditions.push('p.ativo = true')
    else if (ativo === 'false') conditions.push('p.ativo = false')
    if (destaque === 'true') conditions.push('p.destaque = true')
    if (familia_olfativa) {
      const fam = familia_olfativa.replace(/'/g, "''")
      conditions.push(`p.notas_olfativas->>'familia' ILIKE '%${fam}%'`)
    }
    if (em_estoque === 'true') conditions.push('COALESCE(inv.quantidade_atual, 0) > 0')
    if (preco_min) conditions.push(`pp.preco_venda >= ${parseFloat(preco_min)}`)
    if (preco_max) conditions.push(`pp.preco_venda <= ${parseFloat(preco_max)}`)
    if (estoque_baixo === 'true') conditions.push(`COALESCE(inv.quantidade_atual, 0) <= COALESCE(inv.quantidade_minima, 0)`)

    const whereClause = conditions.join(' AND ')

    // ORDER BY
    const orderFieldMap: Record<string, string> = {
      created_at: 'p.created_at', updated_at: 'p.updated_at',
      nome: 'p.nome', sku: 'p.sku', volume: 'p.volume',
    }
    const orderCol = orderFieldMap[order_by] || 'p.created_at'
    const useJsSort = order_by === 'vendas' || order_by === 'preco' || order_by === 'estoque'
    const orderByRaw = useJsSort ? 'p.created_at' : orderCol
    const orderDir = useJsSort ? 'desc' : order_dir

    // Count query
    const countSql = `
      SELECT count(DISTINCT p.id) as total
      FROM products p
      LEFT JOIN brands b ON b.id = p.marca_id
      LEFT JOIN categories c ON c.id = p.categoria_id
      LEFT JOIN inventory_by_company inv ON inv.product_id = p.id AND inv.company_id = (SELECT id FROM companies WHERE account_type = 'matriz' LIMIT 1)
      LEFT JOIN product_prices pp ON pp.product_id = p.id AND pp.canal = 'mercado_livre'
      WHERE ${whereClause}
    `

    // Data query
    const dataSql = `
      SELECT
        p.id, p.sku, p.ean, p.nome, p.genero, p.volume,
        p.descricao_curta, p.descricao_completa, p.ativo, p.destaque,
        p.foto_principal_url, p.created_at, p.updated_at, p.marca_id,
        p.categoria_id, p.fornecedor_id, p.ncm, p.notas_olfativas,
        jsonb_build_object('id', b.id, 'nome', b.nome, 'is_marca_propria', COALESCE(b.is_marca_propria, false)) as marca,
        CASE WHEN c.id IS NOT NULL THEN jsonb_build_object('id', c.id, 'nome', c.nome, 'slug', COALESCE(c.slug, c.nome))
        ELSE NULL END as categoria,
        CASE WHEN inv.id IS NOT NULL THEN
          jsonb_build_object('quantidade_atual', inv.quantidade_atual, 'quantidade_minima', inv.quantidade_minima, 'localizacao_fisica', inv.localizacao_fisica)
        ELSE jsonb_build_object('quantidade_atual', 0, 'quantidade_minima', 0, 'localizacao_fisica', NULL) END as inventory,
        COALESCE((
          SELECT jsonb_agg(jsonb_build_object('canal', pp2.canal, 'preco_venda', pp2.preco_venda, 'preco_promocional', pp2.preco_promocional, 'custo', pp2.custo))
          FROM product_prices pp2 WHERE pp2.product_id = p.id
        ), '[]') as prices,
        COALESCE((
          SELECT jsonb_agg(row ORDER BY row_id)
          FROM (
            SELECT DISTINCT ON (ml.id)
              jsonb_build_object(
                'id', ml.id, 'listing_id', ml.listing_id, 'permalink', ml.permalink,
                'status', ml.status, 'preco_atual', ml.preco_atual, 'vendas_total', ml.vendas_total,
                'listing_type', ml.listing_type, 'health', ml.health, 'condition', ml.condition,
                'modo_compra', ml.modo_compra, 'data_criacao_ml', ml.data_criacao_ml
              ) as row, ml.id as row_id
            FROM marketplace_listings ml
            WHERE ml.product_id = p.id
            ORDER BY ml.id
          ) ml_sub
        ), '[]') as marketplace_listings,
        (SELECT count(*)::int FROM marketplace_listings ml2 WHERE ml2.product_id = p.id) as marketplace_listings_count,
        (SELECT count(*)::int FROM order_items oi WHERE oi.product_id = p.id) as order_items_count
      FROM products p
      LEFT JOIN brands b ON b.id = p.marca_id
      LEFT JOIN categories c ON c.id = p.categoria_id
      LEFT JOIN inventory_by_company inv ON inv.product_id = p.id AND inv.company_id = (SELECT id FROM companies WHERE account_type = 'matriz' LIMIT 1)
      LEFT JOIN product_prices pp ON pp.product_id = p.id AND pp.canal = 'mercado_livre'
      WHERE ${whereClause}
      GROUP BY p.id, b.id, c.id, inv.id
      ORDER BY ${orderByRaw} ${orderDir}
      LIMIT ${limit} OFFSET ${offset}
    `

    const headers = {
      'Authorization': `Bearer ${SUPABASE_MANAGE_TOKEN}`,
      'apikey': SUPABASE_MANAGE_TOKEN,
      'Content-Type': 'application/json',
    }

    const [countRes, dataRes] = await Promise.all([
      fetch('https://api.supabase.com/v1/projects/ubpiaicdccbpdjjsctuz/database/query', {
        method: 'POST', headers, body: JSON.stringify({ query: countSql }),
      }),
      fetch('https://api.supabase.com/v1/projects/ubpiaicdccbpdjjsctuz/database/query', {
        method: 'POST', headers, body: JSON.stringify({ query: dataSql }),
      }),
    ])

    if (!countRes.ok || !dataRes.ok) {
      const errText = await countRes.text().catch(() => '') + ' | ' + await dataRes.text().catch(() => '')
      return NextResponse.json({ success: false, error: 'Supabase error: ' + errText }, { status: 502 })
    }

    const countJson = await countRes.json()
    const dataJson = await dataRes.json()
    const countArr = Array.isArray(countJson) ? countJson : Object.values(countJson).flat()
    const dataArr = Array.isArray(dataJson) ? dataJson : Object.values(dataJson).flat()
    const total = countArr[0]?.total || 0

    const products = dataArr.map((row: any) => ({
      id: row.id, sku: row.sku, ean: row.ean, nome: row.nome, genero: row.genero, volume: row.volume,
      descricao_curta: row.descricao_curta, descricao_completa: row.descricao_completa,
      ativo: row.ativo, destaque: row.destaque, foto_principal_url: row.foto_principal_url,
      created_at: row.created_at, updated_at: row.updated_at, marca_id: row.marca_id,
      categoria_id: row.categoria_id, fornecedor_id: row.fornecedor_id, ncm: row.ncm,
      notas_olfativas: row.notas_olfativas,
      marca: row.marca, categoria: row.categoria, inventory: row.inventory,
      prices: row.prices || [], marketplace_listings: row.marketplace_listings || [],
      _count: {
        marketplace_listings: row.marketplace_listings_count || 0,
        order_items: row.order_items_count || 0,
      },
    }))

    return NextResponse.json({
      success: true, data: products,
      pagination: { page, limit, total, total_pages: Math.ceil(total / limit) },
    })
  } catch (err: any) {
    console.error('[API Products GET]', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 400 })
  }
}

// =====================================================
// POST /api/products — Criar novo produto
// =====================================================
export async function POST(request: NextRequest) {

  try {
    const body = await request.json()
    const data = ProductCreateSchema.parse(body)

    // Verificar se SKU já existe
    const existing = await prisma.products.findUnique({
      where: { sku: data.sku },
    })
    if (existing) {
      return NextResponse.json(
        { success: false, error: `SKU ${data.sku} já cadastrado` },
        { status: 409 }
      )
    }

    // Criar produto + estoque inicial
    const product = await prisma.products.create({
      data: {
        sku: data.sku,
        ean: data.ean,
        nome: data.nome,
        descricao_curta: data.descricao_curta,
        descricao_completa: data.descricao_completa,
        marca_id: data.marca_id,
        categoria_id: data.categoria_id,
        fornecedor_id: data.fornecedor_id,
        genero: data.genero,
        volume: data.volume,
        ncm: data.ncm,
        notas_olfativas: data.notas_olfativas,
        foto_principal_url: data.foto_principal_url,
        fotos_adicionais: data.fotos_adicionais,
        ativo: true,
        // Criar registro de estoque zerado
        inventory: {
          create: {
            quantidade_atual: 0,
            quantidade_minima: 15,
          },
        },
        // Criar preços zerados (admin preenche depois)
        product_prices: data.company_id
          ? {
              create: [
                { canal: 'mercado_livre', company_id: data.company_id, preco_venda: 0 },
                { canal: 'shopee', company_id: data.company_id, preco_venda: 0 },
                { canal: 'site_b2c', company_id: data.company_id, preco_venda: 0 },
                { canal: 'whatsapp', company_id: data.company_id, preco_venda: 0 },
                { canal: 'b2b', company_id: data.company_id, preco_venda: 0 },
              ],
            }
          : undefined,
      },
      include: {
        brands: true,
        categories: true,
        inventory: true,
        product_prices: true,
      },
    })

    return NextResponse.json(
      { success: true, data: product },
      { status: 201 }
    )
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Dados inválidos', details: err.errors },
        { status: 400 }
      )
    }
    console.error('[API Products POST]', err)
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    )
  }
}
