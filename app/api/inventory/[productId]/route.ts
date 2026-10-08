/**
 * =====================================================
 * API: Estoque do Produto
 * =====================================================
 * GET    /api/inventory/:productId — Buscar estoque
 * PUT    /api/inventory/:productId — Atualizar estoque
 *   Body: { quantidade_atual, quantidade_minima, quantidade_maxima, custo_medio, localizacao_fisica }
 * =====================================================
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const InventoryUpdateSchema = z.object({
  quantidade_atual: z.number().int().min(0).optional(),
  quantidade_minima: z.number().int().min(0).optional(),
  quantidade_maxima: z.number().int().min(0).nullable().optional(),
  custo_medio: z.number().min(0).nullable().optional(),
  localizacao_fisica: z.string().max(100).nullable().optional(),
})

export async function GET(request: NextRequest, { params }: { params: { productId: string } }) {
  try {
    const { productId } = params
    const inv = await prisma.inventory.findFirst({ where: { product_id: productId } })
    if (!inv) {
      return NextResponse.json({ success: false, error: 'Estoque não encontrado' }, { status: 404 })
    }
    return NextResponse.json({ success: true, data: inv })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: { productId: string } }) {
  try {
    const { productId } = params
    const body = await request.json()
    const data = InventoryUpdateSchema.parse(body)

    // Verificar se produto existe
    const product = await prisma.products.findUnique({ where: { id: productId } })
    if (!product) {
      return NextResponse.json({ success: false, error: 'Produto não encontrado' }, { status: 404 })
    }

    // Verificar se inventory existe
    const existing = await prisma.inventory.findFirst({ where: { product_id: productId } })

    let inv
    if (existing) {
      inv = await prisma.inventory.update({
        where: { id: existing.id },
        data: {
          quantidade_atual: data.quantidade_atual,
          quantidade_minima: data.quantidade_minima,
          quantidade_maxima: data.quantidade_maxima,
          custo_medio: data.custo_medio,
          localizacao_fisica: data.localizacao_fisica,
          // Atualizar timestamps baseado no tipo de operação
          ultima_entrada: data.quantidade_atual != null && existing.quantidade_atual != null && data.quantidade_atual > existing.quantidade_atual
            ? new Date()
            : existing.ultima_entrada,
          ultima_saida: data.quantidade_atual != null && existing.quantidade_atual != null && data.quantidade_atual < existing.quantidade_atual
            ? new Date()
            : existing.ultima_saida,
        },
      })
    } else {
      inv = await prisma.inventory.create({
        data: {
          product_id: productId,
          quantidade_atual: data.quantidade_atual ?? 0,
          quantidade_minima: data.quantidade_minima ?? 0,
          quantidade_maxima: data.quantidade_maxima ?? null,
          custo_medio: data.custo_medio ?? null,
          localizacao_fisica: data.localizacao_fisica ?? null,
        },
      })
    }

    // Criar movimento de estoque se a quantidade mudou
    if (data.quantidade_atual != null && existing && data.quantidade_atual !== existing.quantidade_atual) {
      const diff = data.quantidade_atual - existing.quantidade_atual
      await prisma.inventory_movements.create({
        data: {
          product_id: productId,
          tipo: diff > 0 ? 'entrada' : 'saida',
          quantidade: Math.abs(diff),
          estoque_anterior: existing.quantidade_atual,
          estoque_posterior: data.quantidade_atual,
          origem_tipo: 'manual',
          observacao: 'Ajuste manual via painel',
        },
      }).catch(() => {}) // Se der erro na tabela, ignora
    }

    return NextResponse.json({ success: true, data: inv })
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: 'Dados inválidos', details: err.errors }, { status: 400 })
    }
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
