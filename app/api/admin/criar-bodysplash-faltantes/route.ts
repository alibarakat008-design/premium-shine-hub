import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isMatrizRequest } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

// GET: lista estado atual
export async function GET(req: NextRequest) {
  if (!isMatrizRequest(req)) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const BARBOURS_ID = '8a4056e0-e491-4c11-ac22-d92d85d13cfc'

  // Todas categorias relacionadas a body splash
  const bodySplashCat = await prisma.categories.findUnique({ where: { slug: 'body-splash' } })
  const shimmerCat = await prisma.categories.findUnique({ where: { slug: 'shimmer' } })
  const arabeCat = await prisma.categories.findUnique({ where: { slug: 'arabe' } })
  const mascCat = await prisma.categories.findUnique({ where: { slug: 'masc' } })

  const allBs = await prisma.products.findMany({
    where: { marca_id: BARBOURS_ID, nome: { startsWith: 'BODYSPLASH' } },
    select: { id: true, nome: true, sku: true, ean: true, categoria_id: true },
    orderBy: { nome: 'asc' }
  })

  return NextResponse.json({
    bodySplashCat,
    subcats: { shimmer: shimmerCat, arabe: arabeCat, masc: mascCat },
    totalB: allBs.length,
    products: allBs
  })
}

// POST: cria produtos faltantes + atribui categorias + busca
export async function POST(req: NextRequest) {
  if (!isMatrizRequest(req)) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const BARBOURS_ID = '8a4056e0-e491-4c11-ac22-d92d85d13cfc'
  const body = await req.json()
  const { action } = body

  // ACTION: search - busca produtos por nome (em todas categorias)
  if (action === 'search') {
    const { nome } = body
    const allCats = await prisma.categories.findMany({ select: { id: true, nome: true, slug: true } })
    const catMap = Object.fromEntries(allCats.map(c => [c.id, c]))

    const products = await prisma.products.findMany({
      where: {
        marca_id: BARBOURS_ID,
        nome: { contains: nome, mode: 'insensitive' }
      },
      select: { id: true, nome: true, sku: true, ean: true, categoria_id: true },
      orderBy: { nome: 'asc' }
    })

    const result = products.map(p => ({
      ...p,
      categoria_nome: catMap[p.categoria_id]?.nome ?? 'SEM CATEGORIA',
      categoria_slug: catMap[p.categoria_id]?.slug ?? '?',
    }))

    return NextResponse.json({ query: nome, count: result.length, products: result })
  }

  // Garantir categorias
  let bodySplashCat = await prisma.categories.findUnique({ where: { slug: 'body-splash' } })
  if (!bodySplashCat) {
    bodySplashCat = await prisma.categories.create({
      data: { nome: 'BODY SPLASH', slug: 'body-splash', ativa: true, ordem: 10 }
    })
  }

  const shimmerCat = await prisma.categories.findUnique({ where: { slug: 'shimmer' } })
    || await prisma.categories.create({
      data: { nome: 'SHIMMER', slug: 'shimmer', parent_id: bodySplashCat.id, ativa: true, ordem: 1 }
    })

  const arabeCat = await prisma.categories.findUnique({ where: { slug: 'arabe' } })
    || await prisma.categories.create({
      data: { nome: 'ÁRABE', slug: 'arabe', parent_id: bodySplashCat.id, ativa: true, ordem: 1 }
    })

  const mascCat = await prisma.categories.findUnique({ where: { slug: 'masc' } })
    || await prisma.categories.create({
      data: { nome: 'MASC', slug: 'masc', parent_id: bodySplashCat.id, ativa: true, ordem: 1 }
    })

  // 25 produtos faltantes
  const faltantes = [
    // Standard (categoria: bodySplashCat)
    { nome: 'BODYSPLASH ÁRABE CARAMEL KISS',         sku: 'BODYSPLASH-ARABE-CARAMEL-KISS-200ML',         ean: '7908787703097', cat: null },
    { nome: 'BODYSPLASH ÁRABE PINK CHANTILLY',       sku: 'BODYSPLASH-ARABE-PINK-CHANTILLY-200ML',       ean: '7908787703110', cat: null },
    { nome: 'BODYSPLASH ÁRABE VANILA RUM',            sku: 'BODYSPLASH-ARABE-VANILA-RUM-200ML',            ean: '7908787703103', cat: null },
    { nome: 'BODYSPLASH CELESTIAL GLOW',              sku: 'BODYSPLASH-CELESTIAL-GLOW-200ML',               ean: '7908787700539', cat: null },
    { nome: 'BODYSPLASH KISS IN PARADISE',            sku: 'BODYSPLASH-KISS-IN-PARADISE-200ML',             ean: '7908787703124', cat: null },
    { nome: 'BODYSPLASH POPSICLE',                   sku: 'BODYSPLASH-POPSICLE-200ML',                      ean: '7908787701970', cat: null },
    { nome: 'BODYSPLASH PURE GRACE',                  sku: 'BODYSPLASH-PURE-GRACE-200ML',                   ean: '7901128400051', cat: null },
    { nome: 'BODYSPLASH RICH',                        sku: 'BODYSPLASH-RICH-200ML',                          ean: '7908787700867', cat: null },
    { nome: 'BODYSPLASH ROSEFRESH',                   sku: 'BODYSPLASH-ROSEFRESH-200ML',                    ean: '7901128400037', cat: null },
    { nome: 'BODYSPLASH SENSELESS',                   sku: 'BODYSPLASH-SENSELESS-200ML',                    ean: '7908787700805', cat: null },
    { nome: 'BODYSPLASH SHIMMER BLUE OCEAN GLOW',    sku: 'BODYSPLASH-SHIMMER-BLUE-OCEAN-GLOW-200ML',    ean: '7908787703165', cat: shimmerCat!.id },
    { nome: 'BODYSPLASH SHIMMER GOLDEN TROPIC',      sku: 'BODYSPLASH-SHIMMER-GOLDEN-TROPIC-200ML',       ean: '7908787703127', cat: shimmerCat!.id },
    { nome: 'BODYSPLASH SHIMMER LAVENDER LAGOON GLOW', sku: 'BODYSPLASH-SHIMMER-LAVENDER-LAGOON-GLOW-200ML', ean: '7908787703158', cat: shimmerCat!.id },
    { nome: 'BODYSPLASH SHIMMER PINKSUNSET SHINE',   sku: 'BODYSPLASH-SHIMMER-PINKSUNSET-SHINE-200ML',   ean: '7908787703141', cat: shimmerCat!.id },
    { nome: 'BODYSPLASH SIENNA GLOW',                 sku: 'BODYSPLASH-SIENNA-GLOW-200ML',                  ean: '7908787701222', cat: null },
    { nome: 'BODYSPLASH SOFT BREEZE',                 sku: 'BODYSPLASH-SOFT-BREEZE-200ML',                  ean: '7908787702809', cat: null },
    { nome: 'BODYSPLASH SOLAR CITRUS',                sku: 'BODYSPLASH-SOLAR-CITRUS-200ML',                 ean: '7901128400044', cat: null },
    { nome: 'BODYSPLASH TROPIC SUN',                  sku: 'BODYSPLASH-TROPIC-SUN-200ML',                   ean: '7908787701987', cat: null },
    // MASC (sem EAN)
    { nome: 'BODYSPLASH MASC MIDNIGHT',               sku: 'BODYSPLASH-MASC-MIDNIGHT-200ML',                ean: null,           cat: mascCat!.id },
    { nome: 'BODYSPLASH MASC SIGNATURE',              sku: 'BODYSPLASH-MASC-SIGNATURE-200ML',               ean: null,           cat: mascCat!.id },
    { nome: 'BODYSPLASH MASC URBAN',                  sku: 'BODYSPLASH-MASC-URBAN-200ML',                   ean: null,           cat: mascCat!.id },
  ]

  const created: string[] = []
  const skipped: string[] = []

  for (const p of faltantes) {
    // Verificar se já existe por SKU
    const existing = await prisma.products.findUnique({ where: { sku: p.sku } })
    if (existing) {
      skipped.push(p.nome)
      continue
    }
    await prisma.products.create({
      data: {
        nome: p.nome,
        sku: p.sku,
        ean: p.ean,
        marca_id: BARBOURS_ID,
        categoria_id: p.cat ?? bodySplashCat!.id,
        ativo: true,
        publicado_site: false,
        publicado_shopee: false,
      }
    })
    created.push(p.nome)
  }

  // Marcar SHIMMER MOONLIGHT com subcategoria SHIMMER
  await prisma.products.update({
    where: { id: 'db2d3fe2-899e-44cd-bb8f-afa68d4d1ce6' },
    data: { categoria_id: shimmerCat!.id }
  })

  // Marcar todos os ÁRABE com subcategoria ÁRABE
  const arabeIds = [
    '62abe382-b545-4ac8-a32d-e885de59fd60', // ARABE VANILA RUM (existe)
  ]
  await prisma.products.updateMany({
    where: { id: { in: arabeIds } },
    data: { categoria_id: arabeCat!.id }
  })

  // Listar resultado final
  const allBs = await prisma.products.findMany({
    where: { marca_id: BARBOURS_ID, nome: { startsWith: 'BODYSPLASH' } },
    select: { id: true, nome: true, sku: true, ean: true, categoria_id: true },
    orderBy: { nome: 'asc' }
  })

  return NextResponse.json({
    created,
    skipped,
    totalCreated: created.length,
    totalSkipped: skipped.length,
    totalNow: allBs.length,
    products: allBs,
  })
}

// POST-only action for fixing subcategories
export async function PATCH(req: NextRequest) {
  if (!isMatrizRequest(req)) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { action } = await req.json()
  const BARBOURS_ID = '8a4056e0-e491-4c11-ac22-d92d85d13cfc'

  if (action === 'fix-subcategories') {
    const shimmerCat = await prisma.categories.findUnique({ where: { slug: 'shimmer' } })
    const arabeCat = await prisma.categories.findUnique({ where: { slug: 'arabe' } })
    const mascCat = await prisma.categories.findUnique({ where: { slug: 'masc' } })

    if (!shimmerCat || !arabeCat || !mascCat) {
      return NextResponse.json({ error: 'Categorias nao encontradas' }, { status: 400 })
    }

    const allBs = await prisma.products.findMany({
      where: { marca_id: BARBOURS_ID, nome: { startsWith: 'BODYSPLASH' } }
    })

    const arabeIds = allBs
      .filter(p => p.nome.includes('ÁRABE') || p.nome.includes('ARABE'))
      .map(p => p.id)
    const mascIds = allBs
      .filter(p => p.nome.includes('MASC'))
      .map(p => p.id)

    const arabeUpdated = await prisma.products.updateMany({
      where: { id: { in: arabeIds } },
      data: { categoria_id: arabeCat.id }
    })
    const mascUpdated = await prisma.products.updateMany({
      where: { id: { in: mascIds } },
      data: { categoria_id: mascCat.id }
    })

    return NextResponse.json({
      arabeUpdated: arabeUpdated.count,
      mascUpdated: mascUpdated.count,
      arabeProducts: allBs.filter(p => arabeIds.includes(p.id)).map(p => p.nome),
      mascProducts: allBs.filter(p => mascIds.includes(p.id)).map(p => p.nome),
    })
  }

  return NextResponse.json({ error: 'action inválida' }, { status: 400 })
}
