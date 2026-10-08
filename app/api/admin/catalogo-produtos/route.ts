// /app/api/admin/catalogo-produtos/route.ts
// Lista produtos com foto, estoque, custo, link ML — via Prisma (pool normal do Postgres)
// GET ?mode=produtos-all  → todos os produtos (comportamento padrão, igual antes)
// GET ?mode=produtos&marca_id=X → produtos filtrados por marca
// GET ?...&page=N&limit=M → opcional: pagina o resultado (sem quebrar quem não manda esses params)
//
// Reescrito em 2026-08-31: antes cada chamada ia via HTTP até a Management API do
// Supabase (feita pra ferramentas administrativas, não pra tráfego de app — é isso que
// deixava a página /admin/marcas lenta) e montava o SQL colando marca_id/company_id
// direto na string (injeção de SQL real, via cookie que o parceiro controla). Agora usa
// o pool de conexão normal do Prisma (`$queryRaw` com template — os valores são passados
// como parâmetros de verdade, nunca concatenados) e valida o company_id do parceiro pelo
// token assinado (HMAC), não por um cookie livre.
import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { isMatrizRequest, getAuthenticatedCompanyId } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

const LIURA_MATRIZ = 'e2633570-74da-4b14-9ca1-ba7b0670e612'
const GH_SHOP_COMPANY = 'a2176d33-f604-48cf-8d8a-df4313ce1417'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function asUuid(v: string | null | undefined): string | null {
  return v && UUID_RE.test(v) ? v : null
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const mode = searchParams.get('mode') || 'produtos-all'
    const marcaId = asUuid(searchParams.get('marca_id'))

    // Resolve company_id com segurança:
    // - matriz pode trocar de "conta ativa" (cookie psh_session_company) — ok, matriz vê tudo mesmo
    // - parceiro NUNCA usa esse cookie (o cliente edita à vontade) — sempre o company_id
    //   validado por HMAC dentro do token de sessão (getAuthenticatedCompanyId)
    let cid: string
    if (isMatrizRequest(req)) {
      cid = asUuid(req.cookies.get('psh_session_company')?.value) || LIURA_MATRIZ
    } else {
      const authCid = getAuthenticatedCompanyId(req)
      if (!authCid) {
        return NextResponse.json({ ok: false, error: 'Não autenticado' }, { status: 401 })
      }
      cid = authCid
    }

    const markup = cid === GH_SHOP_COMPANY ? 1.10 : 1.0
    const markupLabel = cid === GH_SHOP_COMPANY ? 'GH SHOP / FLEUR' : 'LIURA'

    if (mode === 'produtos-all' || mode === 'produtos') {
      // Paginação é OPCIONAL — sem page/limit, devolve tudo (mesmo comportamento de sempre,
      // pra não quebrar a tela atual). Quando o front passar esses params, pagina de verdade.
      const limitParam = parseInt(searchParams.get('limit') || '', 10)
      const pageParam = parseInt(searchParams.get('page') || '', 10)
      const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 200) : null
      const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1

      const marcaFilter = marcaId ? Prisma.sql`WHERE p.marca_id = ${marcaId}::uuid` : Prisma.empty
      const limitFragment = limit ? Prisma.sql`LIMIT ${limit} OFFSET ${(page - 1) * limit}` : Prisma.empty

      const rows = await prisma.$queryRaw<any[]>`
        SELECT
          p.id::text as product_id,
          p.sku,
          p.nome,
          p.ean,
          p.volume,
          p.foto_principal_url as foto,
          p.notas_olfativas::text as notas_json,
          p.ativo,
          p.destaque,
          p.publicado_site,
          p.publicado_shopee,
          p.marcado,
          p.marcado_em::text as marcado_em,
          p.marcado_por,
          b.nome as marca_nome,
          b.id::text as marca_id,
          (COALESCE(pp.custo::float, 0) * ${markup}) as custo,
          COALESCE(pp.preco_venda::float, 0) as preco_venda,
          COALESCE(inv.quantidade_atual, 0)::int as estoque,
          COALESCE(marcado_ml.cnt, 0)::int as listings_count,
          ml_permalink.permalink as link_ml
        FROM products p
        LEFT JOIN brands b ON b.id = p.marca_id
        LEFT JOIN product_prices pp ON pp.product_id = p.id AND pp.company_id = ${cid}::uuid
        LEFT JOIN inventory inv ON inv.product_id = p.id
        LEFT JOIN LATERAL (
          SELECT COUNT(*)::int as cnt
          FROM marketplace_listings ml2
          JOIN marketplace_accounts ma2 ON ma2.id = ml2.account_id
          WHERE ml2.product_id = p.id AND ma2.company_id = ${cid}::uuid
        ) marcado_ml ON true
        LEFT JOIN LATERAL (
          SELECT ml.permalink
          FROM marketplace_listings ml
          JOIN marketplace_accounts ma ON ma.id = ml.account_id
          WHERE ml.product_id = p.id AND ma.company_id = ${cid}::uuid
          ORDER BY ml.id ASC
          LIMIT 1
        ) ml_permalink ON true
        ${marcaFilter}
        ORDER BY b.nome ASC, p.nome ASC
        ${limitFragment}
      `

      const produtos = (Array.isArray(rows) ? rows : []).map((p: any) => {
        let olfativa = ''
        try {
          const notas = p.notas_json ? JSON.parse(p.notas_json) : null
          if (notas) {
            if (Array.isArray(notas)) olfativa = notas.join(' / ')
            else if (typeof notas === 'string') olfativa = notas
            else if (notas.familia) olfativa = notas.familia
            else if (notas.tipo) olfativa = notas.tipo
            else if (notas.descricao) olfativa = notas.descricao
          }
        } catch {}

        return {
          product_id: p.product_id,
          sku: p.sku,
          nome: p.nome,
          ean: p.ean || null,
          volume: p.volume || null,
          foto: p.foto || null,
          link_ml: p.link_ml || null,
          ativo: p.ativo !== false,
          destaque: p.destaque || false,
          publicado_site: p.publicado_site || false,
          publicado_shopee: p.publicado_shopee || false,
          marca_nome: p.marca_nome,
          marca_id: p.marca_id,
          custo: p.custo || 0,
          preco_venda: p.preco_venda || 0,
          estoque: p.estoque || 0,
          listings_count: p.listings_count || 0,
          anunciado: (p.listings_count || 0) > 0,
          marcado: p.marcado || false,
          marcado_em: p.marcado_em || null,
          marcado_por: p.marcado_por || null,
          olfativa,
        }
      })

      // Total real do catálogo (respeitando o filtro de marca), independente da página atual.
      // Sem limit/page (comportamento padrão de hoje), produtos.length já É o total.
      let totalCount = produtos.length
      if (limit) {
        const countRows = await prisma.$queryRaw<{ count: bigint }[]>`
          SELECT COUNT(*)::bigint as count FROM products p ${marcaFilter}
        `
        totalCount = Number(countRows[0]?.count ?? 0)
      }

      const totalEstoqueQtd = produtos.reduce((a: number, p: any) => a + (p.estoque || 0), 0)
      const totalEstoqueValor = produtos.reduce((a: number, p: any) => a + (p.estoque || 0) * (p.custo || 0), 0)

      return NextResponse.json({
        ok: true,
        total: totalCount,
        page,
        limit,
        total_estoque_qtd: totalEstoqueQtd,
        total_estoque_valor: totalEstoqueValor,
        total_anunciados: produtos.filter((p: any) => p.anunciado).length,
        total_faltam: produtos.filter((p: any) => !p.anunciado).length,
        custo_label: markupLabel,
        custo_markup: markup,
        produtos,
      })
    }

    // Mode marcas
    const brands = await prisma.brands.findMany({
      select: { id: true, nome: true },
      orderBy: { nome: 'asc' },
    })
    return NextResponse.json({ ok: true, marcas: brands })

  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message?.substring(0, 500) }, { status: 500 })
  }
}
