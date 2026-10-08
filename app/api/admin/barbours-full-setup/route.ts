import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isMatrizRequest } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

/**
 * Regras de categorizacao BARBOURS (ordem = prioridade):
 * 1. BODYSPLASH prefixo 2. KIT 3. ESFOLIANTE
 * 4. GELEIA + CAPILAR -> PERFUME CAPILAR (gel cabelo)
 * 5. GELEIA 6. HIDRATANTE 7. PERFUME CAPILAR / CAPILAR 8. BODY SPLASH 9. uncategorized
 */
function categorize(nome: string): string {
  const n = nome.toUpperCase()
  if (n.startsWith('BODYSPLASH')) return 'body-splash'
  if (n.includes('KIT ') || nome.includes(' + ')) return 'kit'
  if (n.includes('ESFOLIANTE')) return 'esfoliante'
  // "Geleia Perfume Capilar" = gel cabelo -> PERFUME CAPILAR
  if (n.includes('GELEIA') && n.includes('CAPILAR')) return 'perfume-capilar'
  if (n.includes('GELEIA')) return 'geleia'
  if (n.includes('HIDRATANTE') || n.includes('CREME HIDRATANTE')) return 'hidratante'
  if (n.includes('PERFUME CAPILAR')) return 'perfume-capilar'
  if (n.includes('CAPILAR')) return 'perfume-capilar'
  if (n.includes('BODY SPLASH') || n.includes('BODY SPLAH')) return 'body-splash'
  return 'uncategorized'
}

function getCategoryId(catMap: Record<string, string>, slug: string): string | null {
  return catMap[slug] ?? null
}

export async function POST(req: NextRequest) {
  if (!isMatrizRequest(req)) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const BARBOURS_ID = '8a4056e0-e491-4c11-ac22-d92d85d13cfc'
  const { action } = await req.json()

  if (action === 'setup-all') {
    // 1. Garantir todas as categorias
    const cats = [
      { nome: 'BODY SPLASH',      slug: 'body-splash',     ordem: 10 },
      { nome: 'PERFUME CAPILAR',  slug: 'perfume-capilar', ordem: 20 },
      { nome: 'HIDRATANTE',       slug: 'hidratante',      ordem: 30 },
      { nome: 'ESFOLIANTE',       slug: 'esfoliante',      ordem: 31 },
      { nome: 'GELEIA',           slug: 'geleia',          ordem: 32 },
      { nome: 'KIT',              slug: 'kit',             ordem: 40 },
    ]

    const created: string[] = []
    const catMap: Record<string, string> = {}
    for (const c of cats) {
      let existing = await prisma.categories.findUnique({ where: { slug: c.slug } })
      if (!existing) {
        existing = await prisma.categories.create({
          data: { nome: c.nome, slug: c.slug, ativa: true, ordem: c.ordem }
        })
        created.push(c.nome)
      }
      catMap[c.slug] = existing.id
    }

    // 2. Buscar TODOS os produtos BARBOURS
    const allProducts = await prisma.products.findMany({
      where: { marca_id: BARBOURS_ID },
      select: { id: true, nome: true, sku: true, ean: true, categoria_id: true }
    })

    // 3. Categorizar: cada produto recebe EXATAMENTE uma categoria (prioridade)
    // Fazer isso em memória e usar updateMany por grupo (rápido)
    const byTargetCat: Record<string, string[]> = {}
    for (const p of allProducts) {
      const targetSlug = categorize(p.nome)
      if (!byTargetCat[targetSlug]) byTargetCat[targetSlug] = []
      byTargetCat[targetSlug].push(p.id)
    }

    const results: Record<string, number> = {}
    for (const [slug, ids] of Object.entries(byTargetCat)) {
      const newCatId = catMap[slug] ?? null
      if (ids.length > 0) {
        await prisma.products.updateMany({
          where: { id: { in: ids } },
          data: { categoria_id: newCatId }
        })
        results[slug] = ids.length
      }
    }

    // 4. Resultado final
    const allCats = await prisma.categories.findMany({ select: { id: true, nome: true, slug: true } })
    const catNameMap = Object.fromEntries(allCats.map(c => [c.id, c.nome]))

    const finalProducts = await prisma.products.findMany({
      where: { marca_id: BARBOURS_ID },
      select: { id: true, nome: true, sku: true, ean: true, categoria_id: true }
    })

    const grouped: Record<string, typeof finalProducts> = {}
    for (const p of finalProducts) {
      const cn = catNameMap[p.categoria_id ?? ''] ?? 'SEM CATEGORIA'
      if (!grouped[cn]) grouped[cn] = []
      grouped[cn].push(p)
    }

    return NextResponse.json({
      categoriesCreated: created,
      catMap,
      results,
      totalProducts: allProducts.length,
      grouped,
    })
  }

  return NextResponse.json({ error: 'action inválida' }, { status: 400 })
}
