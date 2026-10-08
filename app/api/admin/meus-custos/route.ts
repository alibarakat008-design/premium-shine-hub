import { NextRequest, NextResponse } from 'next/server'
import { verifySessionToken, getCookieName } from '@/lib/auth-parceiro'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/meus-custos
 * Lista e edita os custos dos produtos da EMPRESA do usuário logado (parceiro).
 *
 * - Lê company_id do cookie psh_auth_token (parceiro) OU psh_session_company (matriz filtrando)
 * - Lista TODOS os produtos do catálogo (LEFT JOIN), mesmo sem preço cadastrado,
 *   pra permitir que a empresa parceira cadastre seus primeiros custos
 *
 * POST: UPSERT do custo de um produto (cria product_prices se não existir)
 * Body: { sku: string, custo: number, preco_venda?: number }
 */

/** Decodifica o token HMAC e retorna companyId (parceiro ou matriz) */
function getCompanyIdFromCookie(req: NextRequest): string | null {
  // 1) Parceiro com psh_auth_token (HMAC)
  const token = req.cookies.get(getCookieName())?.value
  if (token) {
    const session = verifySessionToken(token)
    if (session) return session.companyId
  }
  // 2) Matriz/admin com psh_session_company (legado)
  const activeCompany = req.cookies.get('psh_session_company')?.value
  if (activeCompany) return activeCompany
  // 3) Fallback
  const activeAlt = req.cookies.get('psh_session_active_company')?.value
  if (activeAlt) return activeAlt
  return null
}

export async function GET(req: NextRequest) {
  const companyId = getCompanyIdFromCookie(req)
  if (!companyId) {
    return NextResponse.json({ ok: false, error: 'Não logado' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search') || ''
  const page = Number(searchParams.get('page') || 1)
  const limit = Math.min(Number(searchParams.get('limit') || 50), 200)
  const offset = (page - 1) * limit
  const onlySemCusto = searchParams.get('filter') === 'sem_custo'

  // Filtro adicional: "sem custo" = NULL OR = 0 (considera 0 como sem custo também)
  const semCustoWhere = onlySemCusto ? ' AND (pp.product_id IS NULL OR pp.custo IS NULL OR pp.custo = 0)' : ''

  try {
    // Lista APENAS produtos que pertencem a essa empresa:
    //   - produtos que aparecem em orders dela (vendas importadas)
    //   - OU produtos que já têm preço cadastrado por ela (custos órfãos)
    // Multi-tenant correto: cada vendedor vê só os produtos DELE.
    const sql = `
      SELECT
        p.sku,
        p.nome,
        p.categoria_id,
        c.nome AS categoria_nome,
        b.nome AS marca,
        pp.preco_venda,
        pp.custo,
        (COALESCE(pp.preco_venda, 0) - COALESCE(pp.custo, 0)) AS lucro_unit,
        pp.updated_at,
        (pp.product_id IS NOT NULL) AS has_price,
        -- Última NF de compra desse produto (da empresa)
        (
          SELECT spi.custo_unitario
          FROM supplier_purchase_items spi
          JOIN supplier_purchases sp ON sp.id = spi.purchase_id
          WHERE spi.product_id = p.id
            AND sp.company_id = $1::uuid
            AND sp.status = 'recebida'
            AND spi.custo_unitario IS NOT NULL
          ORDER BY COALESCE(sp.data_pedido, sp.created_at) DESC
          LIMIT 1
        ) AS custo_ultima_nf,
        (
          SELECT sp.numero_nota_fiscal
          FROM supplier_purchase_items spi
          JOIN supplier_purchases sp ON sp.id = spi.purchase_id
          WHERE spi.product_id = p.id
            AND sp.company_id = $1::uuid
            AND sp.status = 'recebida'
          ORDER BY COALESCE(sp.data_pedido, sp.created_at) DESC
          LIMIT 1
        ) AS ultima_nf_numero,
        (
          SELECT sp.data_pedido
          FROM supplier_purchase_items spi
          JOIN supplier_purchases sp ON sp.id = spi.purchase_id
          WHERE spi.product_id = p.id
            AND sp.company_id = $1::uuid
            AND sp.status = 'recebida'
          ORDER BY COALESCE(sp.data_pedido, sp.created_at) DESC
          LIMIT 1
        ) AS ultima_nf_data,
        -- Custo médio ponderado de TODAS as NFs recebidas
        (
          SELECT COALESCE(SUM(spi.custo_unitario * spi.quantidade) / NULLIF(SUM(spi.quantidade), 0), 0)
          FROM supplier_purchase_items spi
          JOIN supplier_purchases sp ON sp.id = spi.purchase_id
          WHERE spi.product_id = p.id
            AND sp.company_id = $1::uuid
            AND sp.status = 'recebida'
            AND spi.custo_unitario IS NOT NULL
        ) AS custo_medio,
        (
          SELECT COUNT(DISTINCT sp.id)
          FROM supplier_purchase_items spi
          JOIN supplier_purchases sp ON sp.id = spi.purchase_id
          WHERE spi.product_id = p.id
            AND sp.company_id = $1::uuid
            AND sp.status = 'recebida'
        ) AS total_notas
      FROM products p
      LEFT JOIN product_prices pp ON pp.product_id = p.id AND pp.company_id = $1::uuid
      LEFT JOIN categories c ON c.id = p.categoria_id
      LEFT JOIN brands b ON b.id = p.marca_id
      WHERE (
        EXISTS (
          SELECT 1 FROM order_items oi
          INNER JOIN orders o ON o.id = oi.order_id
          WHERE oi.product_id = p.id AND o.company_id = $1::uuid
        )
        OR EXISTS (
          SELECT 1 FROM product_prices pp2
          WHERE pp2.product_id = p.id AND pp2.company_id = $1::uuid
        )
      )
      AND ($2 = '' OR p.sku ILIKE '%' || $2 || '%' OR p.nome ILIKE '%' || $2 || '%')${semCustoWhere}
      ORDER BY (pp.product_id IS NULL) DESC, p.sku ASC
      LIMIT $3 OFFSET $4
    `
    const produtos: any[] = await prisma.$queryRawUnsafe(sql, companyId, search, limit, offset)

    const totalRes: any[] = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*)::int AS total
      FROM products p
      LEFT JOIN product_prices pp ON pp.product_id = p.id AND pp.company_id = $1::uuid
      WHERE (
        EXISTS (
          SELECT 1 FROM order_items oi
          INNER JOIN orders o ON o.id = oi.order_id
          WHERE oi.product_id = p.id AND o.company_id = $1::uuid
        )
        OR EXISTS (
          SELECT 1 FROM product_prices pp2
          WHERE pp2.product_id = p.id AND pp2.company_id = $1::uuid
        )
      )
      AND ($2 = '' OR p.sku ILIKE '%' || $2 || '%' OR p.nome ILIKE '%' || $2 || '%')${semCustoWhere}
    `, companyId, search)

    const compRes: any[] = await prisma.$queryRawUnsafe(
      `SELECT nome_fantasia, cnpj FROM companies WHERE id = $1::uuid`,
      companyId,
    )

    return NextResponse.json({
      ok: true,
      produtos: produtos.map((p: any) => ({
        sku: p.sku,
        nome: p.nome,
        categoria: p.categoria_nome,
        marca: p.marca,
        preco_venda: Number(p.preco_venda || 0),
        custo: Number(p.custo || 0),
        lucro_unit: Number(p.lucro_unit || 0),
        margem_pct: Number(p.preco_venda) > 0
          ? Math.round((Number(p.lucro_unit) / Number(p.preco_venda)) * 10000) / 100
          : 0,
        has_price: p.has_price,
        updated_at: p.updated_at,
        custo_medio: Number(p.custo_medio || 0),
        custo_ultima_nf: p.custo_ultima_nf != null ? Number(p.custo_ultima_nf) : null,
        ultima_nf_numero: p.ultima_nf_numero || null,
        ultima_nf_data: p.ultima_nf_data || null,
        variacao_pct: p.custo_ultima_nf && Number(p.custo) > 0
          ? Math.round(((Number(p.custo_ultima_nf) - Number(p.custo)) / Number(p.custo)) * 10000) / 100
          : null,
        total_notas: Number(p.total_notas || 0),
      })),
      total: totalRes[0]?.total || 0,
      filter: onlySemCusto ? 'sem_custo' : null,
      company: { nome: compRes[0]?.nome_fantasia, cnpj: compRes[0]?.cnpj },
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}

export async function POST(req: NextRequest) {
  const companyId = getCompanyIdFromCookie(req)
  if (!companyId) {
    return NextResponse.json({ ok: false, error: 'Não logado' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { sku, custo, preco_venda } = body

    if (!sku || typeof custo !== 'number' || custo < 0) {
      return NextResponse.json({
        ok: false,
        error: 'Dados inválidos: precisa { sku, custo }',
      }, { status: 400 })
    }

    // UPSERT — cria product_prices se não existir, atualiza se existir
    // constraint: @@unique([product_id, canal, company_id])
    // schema: preco_venda é NOT NULL Decimal, updated_at existe, NÃO tem created_at
    const custoVal = custo
    const precoVal = typeof preco_venda === 'number' && preco_venda >= 0 ? preco_venda : 0

    const sql = `
      INSERT INTO product_prices (product_id, company_id, preco_venda, custo, canal, updated_at)
      SELECT p.id, $3::uuid, $4, $2, 'manual'::canal_venda, NOW()
      FROM products p WHERE p.sku = $1
      ON CONFLICT (product_id, canal, company_id) DO UPDATE
      SET custo = EXCLUDED.custo,
          preco_venda = CASE WHEN EXCLUDED.preco_venda > 0 THEN EXCLUDED.preco_venda ELSE product_prices.preco_venda END,
          updated_at = NOW()
      RETURNING product_id
    `
    const result: any[] = await prisma.$queryRawUnsafe(sql, sku, custoVal, companyId, precoVal)

    if (!result || result.length === 0) {
      return NextResponse.json({
        ok: false,
        error: `SKU "${sku}" não encontrado no catálogo.`,
      }, { status: 404 })
    }

    return NextResponse.json({
      ok: true,
      message: `Custo de ${sku} atualizado pra R$ ${custoVal.toFixed(2)}`,
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}