/**
 * POST /api/admin/backfill-order-items-produto
 *
 * Atualiza order_items.product_id via JOIN com marketplace_listings.
 *
 * Body: { company_id?: string }  — se omitido, processa TODAS
 *
 * Resolve o bug onde items de Parceiros (ex: COSMARI) ficavam com product_id=NULL
 * porque o sync filtrava marketplace_listings por account_id, mas o Parceiro
 * não tinha listings próprios ainda.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifySessionToken, getCookieName } from '@/lib/auth-parceiro'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function getCompanyIdFromCookie(req: NextRequest): string | null {
  const token = req.cookies.get(getCookieName())?.value
  if (token) {
    const session = verifySessionToken(token)
    if (session) return session.companyId
  }
  return req.cookies.get('psh_session_company')?.value || null
}

export async function POST(req: NextRequest) {
  try {
    let companyId: string | null = null
    try {
      const body = await req.json()
      if (body?.company_id) companyId = body.company_id
    } catch {}
    if (!companyId) companyId = getCompanyIdFromCookie(req)

    // Estratégia: usar o campo "sku" do order_items como listing_id
    // O sync grava sku = item.item.seller_custom_field || item.item.id
    // E o item.item.id é o listing_id do ML
    // MAS: pode ser que sku seja o seller_sku (MLB1234), não o listing_id

    // Estratégia melhor: usar seller_custom_field primeiro, se for MLB ID, usar ele
    // Senão, buscar pelo TÍTULO ou EAN (mais lento mas mais robusto)

    // Por agora, vamos usar o PRIMEIRO CHAR check: MLB listings começam com MLB
    // E sku tipo "BODYSPLASH-..." é seller_custom_field, mas alguns orders têm só o listing_id
    //
    // Estratégia final: tentar várias formas de match
    // 1) Match direto: order_items.sku = marketplace_listings.listing_id
    // 2) Match seller_sku: order_items.sku = products.sku

    let totalUpdated = 0
    const companyFilter = companyId
      ? `AND o.company_id = '${companyId}'::uuid`
      : ''

    // PASSO 1: tenta match direto sku = listing_id (pra items onde sku = "MLB123456")
    const r1 = await prisma.$executeRawUnsafe(`
      UPDATE order_items oi
      SET product_id = ml.product_id
      FROM orders o, marketplace_listings ml
      WHERE oi.order_id = o.id
        AND oi.product_id IS NULL
        ${companyFilter}
        AND ml.listing_id = oi.sku
        AND ml.product_id IS NOT NULL
    `)
    totalUpdated += r1 || 0

    // PASSO 2: tenta match sku = products.sku (seller_custom_field)
    const r2 = await prisma.$executeRawUnsafe(`
      UPDATE order_items oi
      SET product_id = p.id
      FROM orders o, products p
      WHERE oi.order_id = o.id
        AND oi.product_id IS NULL
        ${companyFilter}
        AND p.sku = oi.sku
    `)
    totalUpdated += r2 || 0

    // PASSO 3: tenta match pelo título (nome_produto = products.nome, mas só pra items sem product_id)
    // ATENÇÃO: pode dar falso positivo em produtos com mesmo nome
    const r3 = await prisma.$executeRawUnsafe(`
      UPDATE order_items oi
      SET product_id = p.id
      FROM orders o, products p
      WHERE oi.order_id = o.id
        AND oi.product_id IS NULL
        ${companyFilter}
        AND LOWER(TRIM(p.nome)) = LOWER(TRIM(oi.nome_produto))
    `)
    totalUpdated += r3 || 0

    // Conta quantos ainda estão NULL
    const stillNull: any[] = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*)::int AS total
      FROM order_items oi
      INNER JOIN orders o ON o.id = oi.order_id
      WHERE oi.product_id IS NULL
      ${companyFilter ? `AND o.company_id = '${companyId}'::uuid` : ''}
    `)

    return NextResponse.json({
      ok: true,
      message: `Backfill concluído: ${totalUpdated} items atualizados`,
      atualizados: {
        match_listing_id: r1 || 0,
        match_sku: r2 || 0,
        match_nome: r3 || 0,
      },
      ainda_sem_produto: stillNull[0]?.total || 0,
      company_id: companyId,
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}