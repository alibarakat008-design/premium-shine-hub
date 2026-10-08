// /app/api/admin/brands/route.ts
// GET — retorna analytics de marcas, cookie-aware (parceiros + admin)
//GET ?mode=analytics → analytics por marca (total_vendas, receita, etc.)
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifySessionToken, getCookieName } from '@/lib/auth-parceiro'

export const dynamic = 'force-dynamic'

const LIURA_MATRIZ = 'e2633570-74da-4b14-9ca1-ba7b0670e612'
const GH_SHOP_COMPANY = 'a2176d33-f604-48cf-8d8a-df4313ce1417'

function getCompanyId(req: NextRequest): string {
  const token = req.cookies.get(getCookieName())?.value
  if (token) {
    const session = verifySessionToken(token)
    if (session) return session.companyId
  }
  const activeCompany = req.cookies.get('psh_session_company')?.value
  if (activeCompany) return activeCompany
  const activeAlt = req.cookies.get('psh_active_company')?.value
  if (activeAlt) return activeAlt
  return LIURA_MATRIZ
}

function isGhShop(cid: string): boolean {
  return cid === GH_SHOP_COMPANY
}

function custoMarkup(cid: string): number {
  return isGhShop(cid) ? 1.10 : 1.0
}

export async function GET(req: NextRequest) {
  const companyId = getCompanyId(req)
  const cid = companyId
  const markup = custoMarkup(cid)

  try {
    const { searchParams } = new URL(req.url)
    const mode = searchParams.get('mode') || 'analytics'

    if (mode === 'analytics') {
      // Analytics por marca
      const brandsRows: any[] = await prisma.$queryRawUnsafe(`
        SELECT b.id::text, b.nome, b.logo_url
        FROM brands b
        ORDER BY b.nome ASC
      `)
      if (!brandsRows.length) return NextResponse.json({ success: true, data: [] })

      const productsRows: any[] = await prisma.$queryRawUnsafe(`
        SELECT
          p.id::text,
          p.marca_id::text,
          p.foto_principal_url,
          COALESCE(inv.quantidade_atual, 0)::int as estoque,
          COALESCE(pp.custo, 0)::float * $2::float as custo_medio,
          CASE WHEN EXISTS (
            SELECT 1 FROM marketplace_listings ml
            JOIN marketplace_accounts ma ON ma.id = ml.account_id
            WHERE ml.product_id = p.id AND ma.company_id = $1::uuid
          ) THEN true ELSE false END as tem_listing
        FROM products p
        LEFT JOIN product_prices pp ON pp.product_id = p.id AND pp.company_id = $1::uuid
        LEFT JOIN inventory inv ON inv.product_id = p.id
      `, cid, markup)

      const pidsPorMarca: Record<string, any[]> = {}
      for (const p of productsRows) {
        if (!pidsPorMarca[p.marca_id]) pidsPorMarca[p.marca_id] = []
        pidsPorMarca[p.marca_id].push(p)
      }

      const data = brandsRows.map((b: any) => {
        const prods = pidsPorMarca[b.id] || []
        const com_foto = prods.filter((p: any) => p.foto_principal_url).length
        const sem_foto = prods.length - com_foto
        const estoque = prods.reduce((s: number, p: any) => s + (p.estoque || 0), 0)
        const capital_empatado = prods.reduce((s: number, p: any) => s + (p.estoque || 0) * (p.custo_medio || 0), 0)
        const listados = prods.filter((p: any) => p.tem_listing).length
        const foto_pct = prods.length ? Math.round((com_foto / prods.length) * 100) : 0
        const sku_pct = prods.length ? Math.round((listados / prods.length) * 100) : 0

        return {
          id: b.id,
          nome: b.nome,
          logo_url: b.logo_url,
          total_produtos: prods.length,
          skus_listados: listados,
          produtos_com_foto: com_foto,
          produtos_sem_foto: sem_foto,
          total_vendas: 0,
          unidades_vendidas: 0,
          receita_total: 0,
          estoque_total: estoque,
          capital_empatado: Math.round(capital_empatado * 100) / 100,
          sku_pct,
          foto_pct,
          completeness: Math.round((foto_pct + sku_pct) / 2),
        }
      })

      return NextResponse.json({ success: true, data })
    }

    // Modo simples: só marcas
    const brandsRows: any[] = await prisma.$queryRawUnsafe(`
      SELECT id::text, nome, descricao, logo_url, pais_origem FROM brands ORDER BY nome ASC
    `)
    return NextResponse.json({ success: true, data: brandsRows })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message?.substring(0, 500) }, { status: 500 })
  }
}
