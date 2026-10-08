import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isMatrizRequest } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  if (!isMatrizRequest(req)) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const BARBOURS_ID = '8a4056e0-e491-4c11-ac22-d92d85d13cfc'
  const { action } = await req.json()

  if (action === 'rename-with-sales') {
    // Obter todos os IDs das categorias
    const catMap: Record<string, string | null> = {}
    for (const slug of ['body-splash', 'masc', 'arabe', 'perfume-capilar', 'hidratante', 'geleia', 'kit']) {
      const c = await prisma.categories.findUnique({ where: { slug } })
      catMap[slug] = c?.id ?? null
    }

    const allProducts = await prisma.products.findMany({
      where: { marca_id: BARBOURS_ID, ativo: true },
      select: { id: true, nome: true, sku: true, ean: true, ativo: true, categoria_id: true }
    })

    const renamed: string[] = []
    const deactivated: string[] = []
    const errors: string[] = []

    for (const p of allProducts) {
      const n = p.nome.toUpperCase()
      const isNewStyle = n.startsWith('BODYSPLASH') || n.startsWith('PERFUME CAPILAR') ||
                         n.startsWith('HIDRATANTE') || n.startsWith('ESFOLIANTE')

      if (isNewStyle) {
        // Já está no formato novo, não mexer
        continue
      }

      // PRODUTO VELHO (não começa com BODYSPLASH/PERFUME CAPILAR etc) → desativar
      try {
        await prisma.products.update({
          where: { id: p.id },
          data: { ativo: false, publicado_site: false, publicado_shopee: false }
        })
        deactivated.push(p.id)
      } catch (e: any) { errors.push(`deact ${p.id}: ${e.message}`) }
    }

    // DEDUP: Perfume Capilar Very Sexy - deixar só 1 ativo
    const capilarDuplicates = await prisma.products.findMany({
      where: {
        marca_id: BARBOURS_ID,
        ativo: true,
        AND: [
          { nome: { contains: 'VERY SEXY', mode: 'insensitive' } },
          { nome: { contains: 'CAPILAR', mode: 'insensitive' } },
        ]
      },
      select: { id: true, nome: true, sku: true, ean: true }
    })
    let capilarMerged = 0
    if (capilarDuplicates.length > 1) {
      // Keep the one with EAN
      const withEan = capilarDuplicates.filter(p => p.ean)
      const withoutEan = capilarDuplicates.filter(p => !p.ean)
      const toRemove = withEan.slice(1).concat(withoutEan)
      for (const dup of toRemove) {
        await prisma.products.update({
          where: { id: dup.id },
          data: { ativo: false, nome: `[DUPLICADO] ${dup.nome}` }
        }).catch(() => {})
        capilarMerged++
      }
    }

    // Listar resultado final
    const remaining = await prisma.products.findMany({
      where: { marca_id: BARBOURS_ID, ativo: true },
      select: { id: true, nome: true, sku: true, ean: true },
      orderBy: { nome: 'asc' }
    })

    return NextResponse.json({
      renamed: renamed.length,
      deactivated: deactivated.length,
      capilarMerged,
      errors,
      totalActive: remaining.length,
      products: remaining,
    })
  }

  return NextResponse.json({ error: 'action inválida' }, { status: 400 })
}
