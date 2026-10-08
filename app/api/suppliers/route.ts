/**
 * API: Fornecedores
 * GET /api/suppliers - lista
 * POST /api/suppliers - cria
 *   Body: { nome, cnpj?, contato?, email?, telefone?, prazo_entrega_dias?, condicao_pagamento? }
 * PUT /api/suppliers/[id]
 * DELETE /api/suppliers/[id]
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const suppliers = await prisma.suppliers.findMany({
      orderBy: { nome: 'asc' },
      include: { _count: { select: { products: true } } },
    })
    return NextResponse.json({ success: true, data: suppliers })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    if (!body.nome) return NextResponse.json({ success: false, error: 'Nome obrigatório' }, { status: 400 })
    const supplier = await prisma.suppliers.create({ data: body })
    return NextResponse.json({ success: true, data: supplier })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
