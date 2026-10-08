import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isMatrizRequest } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  if (!isMatrizRequest(req)) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { products } = await req.json()

  if (!Array.isArray(products)) {
    return NextResponse.json({ error: 'products é obrigatório (array)' }, { status: 400 })
  }

  const created: string[] = []
  const skipped: string[] = []

  for (const p of products) {
    const { nome, sku, ean, marca_id, categoria_id, volume, genero, ativo, publicado_site, publicado_shopee } = p

    if (!nome || !sku) {
      skipped.push(`${nome || 'sem nome'} - falta nome ou sku`)
      continue
    }

    const existing = await prisma.products.findUnique({ where: { sku } })
    if (existing) {
      skipped.push(`${nome} (sku ${sku} já existe)`)
      continue
    }

    await prisma.products.create({
      data: {
        nome,
        sku,
        ean: ean ?? null,
        marca_id: marca_id ?? null,
        categoria_id: categoria_id ?? null,
        volume: volume ?? null,
        genero: genero ?? null,
        ativo: ativo ?? true,
        publicado_site: publicado_site ?? false,
        publicado_shopee: publicado_shopee ?? false,
      }
    })
    created.push(nome)
  }

  return NextResponse.json({ created, skipped, total: products.length })
}
