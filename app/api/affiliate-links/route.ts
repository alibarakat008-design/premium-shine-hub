/**
 * =====================================================
 * API: Listar Links de Afiliado
 * =====================================================
 * GET /api/affiliate-links?afiliado_id=...
 * POST /api/affiliate-links — Criar novo link específico
 * =====================================================
 */

// app/api/affiliate-links/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const CreateLinkSchema = z.object({
  product_id: z.string().uuid().optional().nullable(),
  slug: z.string().min(3).regex(/^[a-z0-9-]+$/),
})

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const afiliadoId = searchParams.get('afiliado_id') || session.user.id

  const links = await prisma.affiliate_links.findMany({
    where: { afiliado_id: afiliadoId },
    include: { 
      products: { select: { id: true, nome: true, sku: true, foto_principal_url: true } },
      users: { select: { id: true, nome: true, email: true } },
    },
    orderBy: { created_at: 'desc' },
  })

  return NextResponse.json({ success: true, data: links })
}

export async function POST(request: NextRequest) {

  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 })

    const body = await request.json()
    const data = CreateLinkSchema.parse(body)

    // Buscar afiliado (pra pegar o slug)
    const user = await prisma.users.findUnique({ where: { id: session.user.id } })
    if (!user || user.role !== 'afiliado') {
      return NextResponse.json({ success: false, error: 'Apenas afiliados' }, { status: 403 })
    }

    const userData: any = user.afiliado_data || {}
    const baseSlug = userData.slug || user.id

    // Gerar URL
    const url = data.product_id
      ? `https://premiumshine.com.br/produto/${data.slug}?ref=${baseSlug}`
      : `https://premiumshine.com.br/${data.slug}?ref=${baseSlug}`

    const link = await prisma.affiliate_links.create({
      data: {
        afiliado_id: session.user.id,
        product_id: data.product_id,
        slug: data.slug,
        url_completa: url,
        cliques: 0,
        vendas: 0,
        comissao_gerada: 0,
      },
    })

    return NextResponse.json({ success: true, data: link })
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: 'Dados inválidos' }, { status: 400 })
    }
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
