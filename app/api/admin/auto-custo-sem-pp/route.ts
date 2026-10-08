/**
 * AUTO-CUSTO SEM PP: estima custo de items com product_id setado mas SEM product_prices
 *
 * Para cada item com product_id setado + custo NULL + SEM product_prices da company,
 * busca produto similar já com custo cadastrado, usa o custo médio como estimativa.
 * Se não achar, usa 30% do preço de venda como fallback heurístico.
 *
 * 1) Acha items com product_id setado mas sem product_prices da company
 * 2) Busca produto similar com custo (LIKE em keywords)
 * 3) Cria product_prices (custo + preco_venda)
 * 4) Atualiza order_items.custo_unitario
 *
 * GET /api/admin/auto-custo-sem-pp?company_id=X&batch_size=200&dry_run=true
 * GET /api/admin/auto-custo-sem-pp?company_id=X&batch_size=200 (roda real)
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

const BASIC = 'Basic ' + Buffer.from('premium:shine2026').toString('base64')
const LIURA = 'e2633570-74da-4b14-9ca1-ba7b0670e612'

function normalize(s: string): string {
  return String(s || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractKeywords(s: string): string[] {
  const norm = normalize(s)
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
    // Pega items com product_id setado mas custo NULL E (sem product_prices OU product_prices.custo NULL/0)
    const semPP: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        oi.product_id::text as product_id,
        p.sku,
        p.nome as nome_produto,
        COUNT(*)::int as itens,
        COUNT(DISTINCT o.id)::int as vendas,
        SUM(oi.quantidade)::int as unidades,
        AVG(oi.preco_unitario)::float as preco_medio,
        MAX(oi.preco_unitario)::float as preco_max,
        MIN(oi.preco_unitario)::float as preco_min
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      JOIN products p ON p.id = oi.product_id
      LEFT JOIN product_prices pp ON pp.product_id = p.id AND pp.company_id = $1::uuid AND pp.canal = 'mercado_livre'::canal_venda
      WHERE o.company_id = $1::uuid
        AND o.origem = 'mercado_livre'::order_origem
        AND o.status != 'cancelado'
        AND oi.product_id IS NOT NULL
        AND (oi.custo_unitario IS NULL OR oi.custo_unitario = 0)
        AND (pp.id IS NULL OR pp.custo IS NULL OR pp.custo = 0)
      GROUP BY oi.product_id, p.sku, p.nome
      ORDER BY vendas DESC
    `, companyId)

    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dry_run: true,
        total_produtos_sem_pp: semPP.length,
        amostra_10: semPP.slice(0, 10),
        mensagem: 'Roda sem dry_run pra processar todos',
      })
    }

    let processados = 0
    let comCustoSimilar = 0
    let comCustoFallback = 0
    let erros = 0
    const errorSamples: string[] = []
    const t0 = Date.now()

    for (const item of semPP) {
      try {
        const productId = item.product_id
        const nome = String(item.nome_produto || '').trim()
        if (!productId || !nome) continue

        const precoMedio = Number(item.preco_medio) || 50

        // 1) Procura produto similar por keywords
        let custoEstimado: number | null = null
        const keywords = extractKeywords(nome)
        if (keywords.length > 0) {
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
            const custos = similares.map(s => Number(s.custo_medio)).sort((a, b) => a - b)
            custoEstimado = custos[Math.floor(custos.length / 2)]
          }
        }

        // 2) Fallback: 30% do preço médio
        if (!custoEstimado) {
          custoEstimado = Math.max(5, Math.round(precoMedio * 0.30 * 100) / 100)
          comCustoFallback++
        } else {
          comCustoSimilar++
        }

        // 3) Upsert product_prices
        await prisma.$queryRawUnsafe(`
          INSERT INTO product_prices (product_id, company_id, canal, custo, preco_venda, updated_at)
          VALUES ($1::uuid, $2::uuid, 'mercado_livre'::canal_venda, $3, $4, NOW())
          ON CONFLICT (product_id, canal, company_id) DO UPDATE
          SET custo = EXCLUDED.custo, preco_venda = EXCLUDED.preco_venda, updated_at = NOW()
        `, productId, companyId, custoEstimado, precoMedio)

        // 4) Atualiza order_items com custo
        await prisma.$queryRawUnsafe(`
          UPDATE order_items oi
          SET custo_unitario = $1
          FROM orders o
          WHERE oi.order_id = o.id
            AND o.company_id = $2::uuid
            AND o.origem = 'mercado_livre'::order_origem
            AND o.status != 'cancelado'
            AND oi.product_id = $3::uuid
            AND (oi.custo_unitario IS NULL OR oi.custo_unitario = 0)
        `, custoEstimado, companyId, productId)

        processados++

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
      mensagem: `✅ ${processados} produtos sem product_prices processados. ${comCustoSimilar} com custo similar, ${comCustoFallback} com estimativa 30%`,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message, stack: err.stack?.substring(0, 800) }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}
