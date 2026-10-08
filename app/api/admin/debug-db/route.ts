import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isMatrizRequest } from '@/lib/admin-auth'

export async function GET(req: NextRequest) {
  if (!isMatrizRequest(req)) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  // SHIMMER products
  const shimmers = await prisma.products.findMany({
    where: { nome: { contains: 'SHIMMER', mode: 'insensitive' } },
    select: { id: true, nome: true, sku: true, ean: true, categoria_id: true },
    orderBy: { nome: 'asc' }
  })

  // All categories
  const categories = await prisma.categories.findMany({
    select: { id: true, nome: true, slug: true },
    orderBy: { nome: 'asc' }
  })

  // Check SHIMMER MOONLIGHT by known ID
  const shimmerMoonlight = await prisma.products.findUnique({
    where: { id: 'db2d3fe2-899e-44cd-bb8f-afa68d4d1ce6' },
    select: { id: true, nome: true, sku: true, ean: true, categoria_id: true }
  })

  return NextResponse.json({ shimmers, categories, shimmerMoonlight })
}
