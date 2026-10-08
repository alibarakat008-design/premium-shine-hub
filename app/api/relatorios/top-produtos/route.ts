/**
 * API: Top Produtos
 * GET /api/relatorios/top-produtos?dias=30
 *
 * - Top por margem / quantidade / receita
 * - Multi-tenant: filtra por company_id (cookie psh_auth_token OU psh_session_company)
 * - Matriz sem active_company vê tudo
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifySessionToken, getCookieName } from '@/lib/auth-parceiro'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

function getCompanyIdFromCookie(req: NextRequest): string | null {
  // Parceiro logado via psh_auth_token (HMAC) — usa o company dele
  const token = req.cookies.get(getCookieName())?.value
  if (token) {
    const session = verifySessionToken(token)
    if (session) return session.companyId
  }
  // Matriz/admin filtrando por uma empresa específica
  const activeCompany = req.cookies.get('psh_session_company')?.value
  if (activeCompany) return activeCompany
  const activeAlt = req.cookies.get('psh_session_active_company')?.value
  if (activeAlt) return activeAlt
  return null
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const dias = parseInt(searchParams.get('dias') || '30')

    const companyId = getCompanyIdFromCookie(request)

    const inicio = new Date(Date.now() - dias * 24 * 3600 * 1000)

    // Filtra por company_id quando existir; senão (matriz sem filtro), vê tudo
    const orderWhere: any = { created_at: { gte: inicio } }
    if (companyId) orderWhere.company_id = companyId

    const items = await prisma.order_items.findMany({
      where: { orders: orderWhere },
      select: {
        product_id: true,
        quantidade: true,
        preco_unitario: true,
        orders: { select: { company_id: true } },
        products: {
          select: {
            sku: true,
            nome: true,
            foto_principal_url: true,
            product_prices: {
              where: companyId
                ? { canal: 'mercado_livre', company_id: companyId }
                : { canal: 'mercado_livre' },
              select: { custo: true, preco_venda: true },
            },
          },
        },
      },
    })

    interface P {
      product_id: string; sku: string; nome: string; foto: string | null
      qtd: number; receita: number; custo: number; lucro: number; margem_pct: number
    }
    const map = new Map<string, P>()

    for (const it of items) {
      // Pula items sem product_id OU sem products (vinculado)
      if (!it.product_id || !it.products) continue

      const k = it.product_id
      if (!map.has(k)) {
        const custoUnit = it.products.product_prices?.[0]?.custo ? Number(it.products.product_prices[0].custo.toString()) : 0
        map.set(k, {
          product_id: k, sku: it.products.sku, nome: it.products.nome,
          foto: it.products.foto_principal_url, qtd: 0, receita: 0, custo: 0, lucro: 0, margem_pct: 0,
        })
        // guarda custo unitário pra usar no loop
        ;(map.get(k) as any)._custoUnit = custoUnit
      }
      const p = map.get(k)!
      p.qtd += it.quantidade
      p.receita += it.quantidade * Number(it.preco_unitario)
      p.custo += (p as any)._custoUnit * it.quantidade
      p.lucro = p.receita - p.custo
      p.margem_pct = p.receita > 0 ? (p.lucro / p.receita) * 100 : 0
    }

    const produtos = Array.from(map.values())

    return NextResponse.json({
      success: true,
      company_id: companyId,
      data: {
        top_margem: [...produtos].sort((a, b) => b.margem_pct - a.margem_pct).slice(0, 10),
        top_quantidade: [...produtos].sort((a, b) => b.qtd - a.qtd).slice(0, 10),
        top_receita: [...produtos].sort((a, b) => b.receita - a.receita).slice(0, 10),
      },
    })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}