import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isMatrizRequest } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!isMatrizRequest(req)) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const brandSlug = searchParams.get('brand') // slug: isabelle-la-belle
  const brandNome = searchParams.get('nome') // partial nome match

  if (!brandSlug && !brandNome) {
    return NextResponse.json({ error: 'brand ou nome é obrigatório' }, { status: 400 })
  }

  let products
  if (brandSlug) {
    // brandSlug = "isabelle-la-belle" -> "ISABELLE LA BELLE"
    const brandNomeConvertido = brandSlug.replace(/-/g, ' ').toUpperCase()
    const brand = await prisma.brands.findFirst({
      where: { nome: { equals: brandNomeConvertido } },
      select: { id: true, nome: true }
    })
    if (!brand) return NextResponse.json({ error: 'Brand não encontrada' }, { status: 404 })
    products = await prisma.products.findMany({
      where: { marca_id: brand.id, ativo: true },
      select: { id: true, nome: true, sku: true, ean: true, ativo: true, categoria_id: true },
      orderBy: { nome: 'asc' }
    })
    return NextResponse.json({ brand, products })
  }

  if (brandNome) {
    // Search by brand nome partial match
    const brands = await prisma.brands.findMany({
      where: { nome: { contains: brandNome, mode: 'insensitive' } },
      select: { id: true, nome: true }
    })
    if (brands.length === 0) return NextResponse.json({ error: 'Brand não encontrada' }, { status: 404 })
    if (brands.length > 1) return NextResponse.json({ multiple: true, brands })
    const brand = brands[0]
    products = await prisma.products.findMany({
      where: { marca_id: brand.id, ativo: true },
      select: { id: true, nome: true, sku: true, ean: true, ativo: true, categoria_id: true },
      orderBy: { nome: 'asc' }
    })
    return NextResponse.json({ brand, products })
  }

  return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 })
}
