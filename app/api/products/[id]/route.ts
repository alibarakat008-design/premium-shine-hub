/**
 * =====================================================
 * API DE PRODUTO INDIVIDUAL — Premium Shine Hub
 * =====================================================
 * Endpoints:
 *   GET    /api/products/:id  — Buscar um produto
 *   PUT    /api/products/:id  — Atualizar produto
 *   DELETE /api/products/:id  — Soft delete (marca como inativo)
 * =====================================================
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const ProductUpdateSchema = z.object({
  ean: z.string().max(20).optional().nullable(),
  nome: z.string().min(3).max(255).optional(),
  descricao_curta: z.string().max(500).optional().nullable(),
  descricao_completa: z.string().optional().nullable(),
  marca_id: z.string().uuid().optional(),
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
  ativo: z.boolean().optional(),
  destaque: z.boolean().optional(),
})

interface RouteParams {
  params: { id: string }
}

// =====================================================
// GET /api/products/:id
// =====================================================
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = params

    // Verificar se é UUID ou SKU
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)

    const product = await prisma.products.findFirst({
      where: isUUID ? { id } : { sku: id },
      include: {
        brands: true,
        categories: true,
        suppliers: true,
        inventory: true,
        product_prices: {
          include: {
            companies: {
              select: { id: true, cnpj: true, nome_fantasia: true },
            },
          },
        },
        marketplace_listings: {
          select: {
            id: true,
            listing_id: true,
            permalink: true,
            status: true,
            preco_atual: true,
            preco_original: true,
            preco_promocional: true,
            promocao_inicio: true,
            promocao_fim: true,
            promocao_tipo: true,
            frete_gratis: true,
            envio_full: true,
            stock_disponivel_ml: true,
            vendas_total: true,
            views_total: true,
            listing_type: true,
            health: true,
            condition: true,
            modo_compra: true,
            categoria_id_ml: true,
            data_criacao_ml: true,
            tags: true,
            last_sync_at: true,
            marketplace_accounts: {
              select: { id: true, nickname: true, account_id: true },
            },
          },
        },
        _count: {
          select: {
            order_items: true, // quantas vezes foi vendido
          },
        },
      },
    })

    if (!product) {
      return NextResponse.json(
        { success: false, error: 'Produto não encontrado' },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true, data: product })
  } catch (err: any) {
    console.error('[API Product GET]', err)
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    )
  }
}

// =====================================================
// PUT /api/products/:id
// =====================================================
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = params
    const body = await request.json()
    const data = ProductUpdateSchema.parse(body)

    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)

    // Verificar se existe
    const existing = await prisma.products.findFirst({
      where: isUUID ? { id } : { sku: id },
    })

    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Produto não encontrado' },
        { status: 404 }
      )
    }

    // Atualizar
    const product = await prisma.products.update({
      where: { id: existing.id },
      data: {
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
        ativo: data.ativo,
        destaque: data.destaque,
        updated_at: new Date(),
      },
      include: {
        brands: true,
        categories: true,
        inventory: true,
        product_prices: true,
      },
    })

    return NextResponse.json({ success: true, data: product })
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Dados inválidos', details: err.errors },
        { status: 400 }
      )
    }
    console.error('[API Product PUT]', err)
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    )
  }
}

// =====================================================
// DELETE /api/products/:id — Soft Delete
// =====================================================
export async function DELETE(request: NextRequest, { params }: RouteParams) {

  try {
    const { id } = params
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)

    const existing = await prisma.products.findFirst({
      where: isUUID ? { id } : { sku: id },
    })

    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Produto não encontrado' },
        { status: 404 }
      )
    }

    // Soft delete (marca como inativo ao invés de deletar)
    // Preserva histórico de vendas
    const product = await prisma.products.update({
      where: { id: existing.id },
      data: {
        ativo: false,
        updated_at: new Date(),
      },
    })

    return NextResponse.json({
      success: true,
      message: 'Produto desativado (soft delete)',
      data: product,
    })
  } catch (err: any) {
    console.error('[API Product DELETE]', err)
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    )
  }
}
