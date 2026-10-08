import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isMatrizRequest } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!isMatrizRequest(req)) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const shimmers = await prisma.products.findMany({
    where: { nome: { contains: 'SHIMMER', mode: 'insensitive' } },
    select: { id: true, nome: true, sku: true, ean: true, categoria_id: true },
    orderBy: { nome: 'asc' }
  })
  const categories = await prisma.categories.findMany({
    select: { id: true, nome: true, slug: true, parent_id: true },
    orderBy: { nome: 'asc' }
  })
  const BARBOURS_ID = '8a4056e0-e491-4c11-ac22-d92d85d13cfc'
  const allBs = await prisma.products.findMany({
    where: { marca_id: BARBOURS_ID, nome: { startsWith: 'BODYSPLASH' } },
    select: { id: true, nome: true, sku: true, ean: true, categoria_id: true },
    orderBy: { nome: 'asc' }
  })
  return NextResponse.json({ shimmers, categories, allBs })
}

export async function POST(req: NextRequest) {
  if (!isMatrizRequest(req)) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { action } = await req.json()
  const BARBOURS_ID = '8a4056e0-e491-4c11-ac22-d92d85d13cfc'

  // ACTION: setup - cria categorias e atribui a TODOS os BODYSPLASH
  if (action === 'setup') {
    // 1. Criar/atualizar BODY SPLASH
    let bodySplashCat = await prisma.categories.findUnique({ where: { slug: 'body-splash' } })
    if (!bodySplashCat) {
      bodySplashCat = await prisma.categories.create({
        data: { nome: 'BODY SPLASH', slug: 'body-splash', ativa: true, ordem: 10 }
      })
    }

    // 2. Criar subcategorias
    const subcats = [
      { nome: 'SHIMMER', slug: 'shimmer', parent_id: bodySplashCat.id },
      { nome: 'ÁRABE', slug: 'arabe', parent_id: bodySplashCat.id },
      { nome: 'MASC', slug: 'masc', parent_id: bodySplashCat.id },
    ]
    const createdSubcats: string[] = []
    for (const sc of subcats) {
      const existing = await prisma.categories.findUnique({ where: { slug: sc.slug } })
      if (!existing) {
        await prisma.categories.create({ data: { ...sc, ativa: true, ordem: 1 } })
        createdSubcats.push(sc.nome)
      }
    }

    // 3. Atualizar TODOS os BODYSPLASH com a categoria BODY SPLASH
    const updatedBs = await prisma.products.updateMany({
      where: { marca_id: BARBOURS_ID, nome: { startsWith: 'BODYSPLASH' } },
      data: { categoria_id: bodySplashCat.id }
    })

    // 4. Identificar e marcar os SHIMMER com subcategoria SHIMMER
    const shimmerCat = await prisma.categories.findUnique({ where: { slug: 'shimmer' } })
    const allShimmer = await prisma.products.findMany({
      where: { marca_id: BARBOURS_ID, nome: { contains: 'SHIMMER', mode: 'insensitive' } }
    })
    if (shimmerCat && allShimmer.length > 0) {
      await prisma.products.updateMany({
        where: { id: { in: allShimmer.map(p => p.id) } },
        data: { categoria_id: shimmerCat.id }
      })
    }

    const allBs = await prisma.products.findMany({
      where: { marca_id: BARBOURS_ID, nome: { startsWith: 'BODYSPLASH' } },
      select: { id: true, nome: true, sku: true, ean: true, categoria_id: true },
      orderBy: { nome: 'asc' }
    })

    return NextResponse.json({
      bodySplashCat,
      subcatsCreated: createdSubcats,
      productsUpdated: updatedBs.count,
      shimmersWithCategory: allShimmer.length,
      allBs,
    })
  }

  // ACTION: shimmer-fix - atribui subcategoria SHIMMER a todos produtos com SHIMMER no nome
  if (action === 'shimmer-fix') {
    let shimmerCat = await prisma.categories.findUnique({ where: { slug: 'shimmer' } })
    if (!shimmerCat) {
      shimmerCat = await prisma.categories.create({
        data: { nome: 'SHIMMER', slug: 'shimmer', ativa: true, ordem: 1 }
      })
    }

    const allShimmer = await prisma.products.findMany({
      where: { nome: { contains: 'SHIMMER', mode: 'insensitive' } }
    })
    const updated = await prisma.products.updateMany({
      where: { id: { in: allShimmer.map(p => p.id) } },
      data: { categoria_id: shimmerCat.id }
    })

    return NextResponse.json({
      shimmerCat,
      updatedCount: updated.count,
      shimmers: allShimmer.map(p => ({ id: p.id, nome: p.nome, sku: p.sku, ean: p.ean }))
    })
  }

  return NextResponse.json({ error: 'action inválida' }, { status: 400 })
}
