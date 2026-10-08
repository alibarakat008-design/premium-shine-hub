/**
 * AUTO-CUSTO ÓRFÃOS: estima custo de items sem product_id
 *
 * Para cada item órfão (product_id IS NULL), procura produto similar já com custo
 * cadastrado, usa o custo médio como estimativa. Se não achar, usa 30% do preço
 * de venda como fallback heurístico.
 *
 * 1) Cria/atualiza product baseado em nome
 * 2) Cadastra custo em product_prices
 * 3) Atualiza order_items: product_id + custo_unitario
 *
 * GET /api/admin/auto-custo-orf?company_id=X&batch_size=200&dry_run=true
 * GET /api/admin/auto-custo-orf?company_id=X&batch_size=200 (roda real)
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

const BASIC = 'Basic ' + Buffer.from('premium:shine2026').toString('base64')
const LIURA = 'e2633570-74da-4b14-9ca1-ba7b0670e612'

// Normaliza nome: lowercase, sem acentos, sem pontuação
function normalize(s: string): string {
  return String(s || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractKeywords(s: string): string[] {
  const norm = normalize(s)
  // Pega palavras significativas (>= 4 chars)
  return norm.split(' ').filter(w => w.length >= 4).slice(0, 5)
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== BASIC) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }
  const { searchParams } = new URL(req.url)
  const companyId = searchParams.get('company_id') || LIURA
  const batchSize = Math.max(50, Math.min(Number(searchParams.get('batch_size') || 500), 2000))
  const dryRun = searchParams.get('dry_run') === 'true'

  try {
    // Pega os items órfãos distintos (por nome_produto) pra estimar
    const orfaosPorNome: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        oi.nome_produto,
        COUNT(*)::int as itens,
        COUNT(DISTINCT o.id)::int as vendas,
        SUM(oi.quantidade)::int as unidades,
        AVG(oi.preco_unitario)::float as preco_medio,
        MAX(oi.preco_unitario)::float as preco_max,
        MIN(oi.preco_unitario)::float as preco_min
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.company_id = $1::uuid
        AND o.origem = 'mercado_livre'::order_origem
        AND o.status != 'cancelado'
        AND oi.product_id IS NULL
        AND oi.nome_produto IS NOT NULL
      GROUP BY oi.nome_produto
      ORDER BY vendas DESC
    `, companyId)

    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dry_run: true,
        total_nomes_orfaos: orfaosPorNome.length,
        amostra_10: orfaosPorNome.slice(0, 10),
        mensagem: 'Roda sem dry_run pra processar todos',
      })
    }

    let processados = 0
    let comCustoSimilar = 0
    let comCustoFallback = 0
    let erros = 0
    const errorSamples: string[] = []
    const t0 = Date.now()

    for (const item of orfaosPorNome) {
      try {
        const nome = String(item.nome_produto || '').trim()
        if (!nome) continue

        const precoMedio = Number(item.preco_medio) || 50

        // 1) Procura produto similar por keywords
        let custoEstimado: number | null = null
        let produtoSimilarId: string | null = null
        const keywords = extractKeywords(nome)
        if (keywords.length > 0) {
          // LIKE com as primeiras 2 keywords (mais eficiente)
          const likePatterns = keywords.slice(0, 2).map(k => `%${k}%`)
          const where = likePatterns.map((_, i) => `p.nome ILIKE $${i + 1}`).join(' AND ')
          const similares: any[] = await prisma.$queryRawUnsafe(`
            SELECT
              p.id::text as product_id,
              AVG(pp.custo)::float as custo_medio,
              COUNT(*)::int as qtd_precos
            FROM products p
            JOIN product_prices pp ON pp.product_id = p.id AND pp.company_id = $${likePatterns.length + 1}::uuid AND pp.custo > 0
            WHERE ${where}
            GROUP BY p.id
            ORDER BY custo_medio DESC
            LIMIT 5
          `, ...likePatterns, companyId)

          if (similares.length > 0) {
            // Pega o custo médio dos similares (excluindo o maior que pode ser outlier)
            const custos = similares.map(s => Number(s.custo_medio)).sort((a, b) => a - b)
            // Mediana dos custos
            custoEstimado = custos[Math.floor(custos.length / 2)]
            produtoSimilarId = similares[0]?.product_id || null
          }
        }

        // 2) Fallback: 30% do preço médio (heurística conservadora)
        if (!custoEstimado) {
          custoEstimado = Math.max(5, Math.round(precoMedio * 0.30 * 100) / 100)
          comCustoFallback++
        } else {
          comCustoSimilar++
        }

        // 3) Encontra ou cria product (find by name se não tem SKU)
        let productId: string | null = produtoSimilarId
        if (!productId) {
          // Tenta achar product com mesmo nome
          const existing: any[] = await prisma.$queryRawUnsafe(`
            SELECT id::text as id FROM products WHERE nome ILIKE $1 LIMIT 1
          `, nome)
          if (existing.length > 0) {
            productId = existing[0].id
          } else {
            // Cria novo product com SKU único baseado no nome
            const sku = `AUTO-${normalize(nome).slice(0, 30).replace(/ /g, '-')}-${Date.now().toString(36).slice(-4)}`
            const novo: any = await prisma.$queryRawUnsafe(`
              INSERT INTO products (sku, nome, ativo, created_at, updated_at)
              VALUES ($1, $2, true, NOW(), NOW())
              RETURNING id::text as id
            `, sku, nome)
            productId = novo[0].id
          }
        }

        // 4) Upsert product_prices atômico (sem race condition)
        await prisma.$queryRawUnsafe(`
          INSERT INTO product_prices (product_id, company_id, canal, custo, preco_venda, updated_at)
          VALUES ($1::uuid, $2::uuid, 'mercado_livre'::canal_venda, $3, $4, NOW())
          ON CONFLICT (product_id, canal, company_id) DO UPDATE
          SET custo = EXCLUDED.custo, updated_at = NOW()
        `, productId, companyId, custoEstimado, precoMedio)

        // 5) Atualiza order_items órfãos com product_id e custo
        await prisma.$queryRawUnsafe(`
          UPDATE order_items oi
          SET product_id = $1::uuid, custo_unitario = $2
          FROM orders o
          WHERE oi.order_id = o.id
            AND o.company_id = $3::uuid
            AND o.origem = 'mercado_livre'::order_origem
            AND o.status != 'cancelado'
            AND oi.nome_produto = $4
            AND oi.product_id IS NULL
        `, productId, custoEstimado, companyId, nome)

        processados++

        // Limite pra evitar timeout
        if (processados >= batchSize) break
      } catch (e: any) {
        erros++
        if (errorSamples.length < 5) {
          errorSamples.push(`"${item.nome_produto?.slice(0, 40)}": ${e.message?.substring(0, 100)}`)
        }
      }
    }

    return NextResponse.json({
      ok: true,
      processados,
      com_custo_similar: comCustoSimilar,
      com_custo_fallback_30pct: comCustoFallback,
      erros,
      erro_amostra: errorSamples,
      duracao_ms: Date.now() - t0,
      mensagem: `✅ ${processados} produtos órfãos processados. ${comCustoSimilar} com custo similar, ${comCustoFallback} com estimativa 30%`,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message, stack: err.stack?.substring(0, 800) }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}
