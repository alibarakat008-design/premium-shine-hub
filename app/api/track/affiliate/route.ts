/**
 * =====================================================
 * API: Tracking de Cliques de Afiliado
 * =====================================================
 * GET /api/track/affiliate?ref=joana123&product=ASAD
 *
 * Quando o cliente clica no link do afiliado:
 *   1) Marca o cookie dele (dura 30 dias)
 *   2) Redireciona pro site
 *   3) Quando comprar, sistema atribui a venda ao afiliado
 * =====================================================
 */

// app/api/track/affiliate/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {

  const { searchParams } = new URL(request.url)
  const ref = searchParams.get('ref') // slug do afiliado
  const productSlug = searchParams.get('product')

  if (!ref) {
    return NextResponse.json({ error: 'ref obrigatório' }, { status: 400 })
  }

  // Buscar link
  const link = await prisma.affiliate_links.findFirst({
    where: { slug: ref },
    include: { users: { select: { id: true, ativo: true } } },
  })

  if (!link || !link.users.ativo) {
    return NextResponse.json({ error: 'Afiliado não encontrado' }, { status: 404 })
  }

  // Incrementar clique
  await prisma.affiliate_links.update({
    where: { id: link.id },
    data: { cliques: { increment: 1 } },
  })

  // Redirecionar pro site com cookie de afiliado
  const destino = productSlug
    ? `https://premiumshine.com.br/produto/${productSlug}?ref=${ref}`
    : `https://premiumshine.com.br/?ref=${ref}`

  const response = NextResponse.redirect(destino)

  // Cookie dura 30 dias
  response.cookies.set('affiliate_ref', ref, {
    maxAge: 30 * 24 * 60 * 60, // 30 dias
    httpOnly: false, // JS do site precisa ler
    secure: true,
    sameSite: 'lax',
  })

  return response
}
