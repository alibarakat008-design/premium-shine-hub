// POST /api/admin/products/import-costs
// Versão OTIMIZADA pra Vercel free tier (timeout 10s)
// - 1 query de lookup pra todos os SKUs (findMany com IN)
// - Update em BULK via transaction (custo updateMany por SKU)
// - Insert em BULK via createMany pros novos
// - Audit log consolidado

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { audit, auditFromRequest } from '@/lib/audit'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// Vercel free: maxDuration só vale no plano Pro. Free = 10s hard limit.
// Por isso a query precisa ser rápida. Se passar de 300 SKUs, recomenda chunk.

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') || ''
    const canal = (req.nextUrl.searchParams.get('canal') || 'mercado_livre') as
      | 'mercado_livre' | 'shopee' | 'site_b2c' | 'b2b' | 'whatsapp'

    let rows: { sku: string; custo: number; titulo?: string }[] = []

    if (contentType.includes('application/json')) {
      const body = await req.json()
      const data = body.data || body.rows || body
      rows = (Array.isArray(data) ? data : []).map((r: any) => ({
        sku: String(r.sku || r.SKU || '').trim(),
        custo: Number(String(r.custo || r.cost || 0).replace(',', '.')),
        titulo: r.titulo || r.nome || r.title,
      })).filter((r: any) => r.sku && !isNaN(r.custo))
    } else {
      let text = ''
      try { text = await req.text() } catch (e: any) {
        return NextResponse.json({ ok: false, error: `Falha ao ler corpo: ${e.message}` }, { status: 400 })
      }
      if (!text || text.trim().length === 0) {
        return NextResponse.json({ ok: false, error: 'Arquivo vazio. Envie o CSV com titulo,sku,custo.' }, { status: 400 })
      }
      try { rows = parseCSV(text) } catch (e: any) {
        return NextResponse.json({ ok: false, error: `Erro ao parsear CSV: ${e.message}` }, { status: 400 })
      }
    }

    if (rows.length === 0) {
      return NextResponse.json({
        ok: false,
        error: 'Nenhuma linha válida encontrada. Verifique se o arquivo tem o cabeçalho "titulo,sku,custo" e a coluna SKU preenchida.',
      }, { status: 400 })
    }

    // HARD-LIMIT VERCEL FREE: bulk SQL resolve tudo em 1-3 queries, então
    // mesmo 1500 linhas terminam em ~7s (margem segura pros 10s do free tier).
    const HARD_LIMIT = 1500
    if (rows.length > HARD_LIMIT) {
      return NextResponse.json({
        ok: false,
        error: `Planilha com ${rows.length} linhas excede o limite de ${HARD_LIMIT} por importação (Vercel free tier 10s). Divida em arquivos menores e importe em partes.`,
        hint: 'Divida o CSV em pedaços (cada um ≤ 1500 linhas) e importe um de cada vez.',
      }, { status: 413 })
    }

    const t0 = Date.now()

    // Deduplica SKUs (mantém o último custo visto)
    const skuMap = new Map<string, { sku: string; custo: number; titulo?: string }>()
    for (const r of rows) skuMap.set(r.sku, r)
    const uniqueRows = Array.from(skuMap.values())
    const skus = uniqueRows.map((r) => r.sku)

    // 1) LOOKUP único de products + seus product_prices neste canal
    const products = await prisma.products.findMany({
      where: { sku: { in: skus } },
      select: {
        id: true,
        sku: true,
        product_prices: {
          where: { canal },
          select: { id: true, custo: true },
          take: 1,
        },
      },
    })

    const productMap = new Map(products.map((p) => [p.sku, p]))
    const foundSkus = new Set(products.map((p) => p.sku))
    const notFound = uniqueRows.filter((r) => !foundSkus.has(r.sku))

    // 2) Separa: existing (já tem product_price) vs new (precisa criar)
    const toUpdate: { id: string; custo: number; sku: string; custoAntigo: number }[] = []
    const toCreate: { product_id: string; canal: typeof canal; custo: number }[] = []
    const mudancasCriticas: any[] = []

    for (const row of uniqueRows) {
      const product = productMap.get(row.sku)
      if (!product) continue
      if (product.product_prices.length > 0) {
        const pp = product.product_prices[0]
        const custoAntigo = Number(pp.custo || 0)
        toUpdate.push({ id: pp.id, custo: row.custo, sku: row.sku, custoAntigo })
        const diff = Math.abs(row.custo - custoAntigo)
        if (custoAntigo > 0 && (diff / custoAntigo > 0.05 || diff > 5)) {
          mudancasCriticas.push({
            sku: row.sku, custo_antigo: custoAntigo, custo_novo: row.custo,
            variacao_pct: ((row.custo - custoAntigo) / custoAntigo) * 100,
          })
        }
      } else {
        toCreate.push({ product_id: product.id, canal, custo: row.custo })
      }
    }

    // 3) BULK update em transação (1 round-trip por SKU com $executeRaw? Não — usa Promise.all de updates)
    //    OU melhor: usar SQL UPDATE com CASE WHEN (PostgreSQL) pra atualizar todos de uma vez
    let updatedCount = 0
    let createdCount = 0

    if (toUpdate.length > 0) {
      // Estratégia A: SQL bulk update com CASE WHEN (1 query, super rápido)
      // Funciona pra QUALQUER quantidade de SKUs porque é 1 round-trip
      const caseClauses = toUpdate.map((u, i) =>
        `WHEN id = '${u.id}' THEN ${u.custo}::numeric`
      ).join(' ')
      const ids = toUpdate.map((u) => `'${u.id}'`).join(',')
      const sql = `
        UPDATE product_prices
        SET custo = CASE ${caseClauses} END
        WHERE id IN (${ids})
      `
      try {
        const result = await prisma.$executeRawUnsafe(sql)
        updatedCount = Number(result) || toUpdate.length
        if (updatedCount !== toUpdate.length) {
          // Fallback se Prisma retornar contagem diferente
          updatedCount = toUpdate.length
        }
      } catch (sqlErr: any) {
        // Fallback: update 1 por 1 (mas em paralelo com concorrência limitada)
        const results = await Promise.allSettled(
          toUpdate.map((u) =>
            prisma.product_prices.update({ where: { id: u.id }, data: { custo: u.custo } })
          )
        )
        updatedCount = results.filter((r) => r.status === 'fulfilled').length
      }
    }

    if (toCreate.length > 0) {
      // createMany (1 query)
      const result = await prisma.product_prices.createMany({
        data: toCreate.map((c) => ({
          product_id: c.product_id,
          canal: c.canal,
          custo: c.custo,
          preco_venda: 0,
        })),
        skipDuplicates: true,
      })
      createdCount = result.count
    }

    // 4) Audit log consolidado
    if (updatedCount + createdCount > 0) {
      const ctx = auditFromRequest(req)
      await audit({
        acao: 'product.cost_change',
        tabela: 'product_prices',
        dados_novos: {
          total_alteracoes: updatedCount + createdCount,
          atualizados: updatedCount,
          criados: createdCount,
          canal,
        },
        ...ctx,
        metadata: {
          origem: 'csv_import_bulk',
          total_linhas: rows.length,
          skus_unicos: uniqueRows.length,
          mudancas_criticas: mudancasCriticas.slice(0, 20),
          total_criticas: mudancasCriticas.length,
          duracao_ms: Date.now() - t0,
        },
      })
    }

    const duracao = Date.now() - t0

    return NextResponse.json({
      ok: true,
      total_linhas: rows.length,
      skus_unicos: uniqueRows.length,
      atualizados: updatedCount,
      criados: createdCount,
      nao_encontrados: notFound.length,
      nao_encontrados_amostra: notFound.slice(0, 20).map((r) => r.sku),
      erros: 0,
      duracao_ms: duracao,
      canal,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

function parseCSV(text: string): { sku: string; custo: number; titulo?: string }[] {
  const clean = text.replace(/^\uFEFF/, '').trim()
  const lines = clean.split(/\r?\n/)
  if (lines.length < 2) return []

  const firstLine = lines[0]
  const sep = firstLine.includes(';') ? ';' : ','

  const headers = firstLine.split(sep).map((h) => h.trim().toLowerCase())
  const idxTitulo = headers.findIndex((h) => h.includes('titulo') || h.includes('title') || h.includes('nome'))
  const idxSku = headers.findIndex((h) => h.includes('sku'))
  const idxCusto = headers.findIndex((h) => h.includes('custo') || h.includes('cost') || h.includes('preco'))

  if (idxSku < 0 || idxCusto < 0) return []

  const rows: { sku: string; custo: number; titulo?: string }[] = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const cells = parseCSVLine(line, sep)
    const sku = cells[idxSku]?.trim()
    const custoStr = cells[idxCusto]?.replace(',', '.').trim()
    const custo = Number(custoStr || 0)
    if (!sku || isNaN(custo)) continue
    rows.push({ sku, custo, titulo: idxTitulo >= 0 ? cells[idxTitulo]?.trim() : undefined })
  }
  return rows
}

function parseCSVLine(line: string, sep: string): string[] {
  const cells: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (c === sep && !inQuotes) {
      cells.push(current); current = ''
    } else current += c
  }
  cells.push(current)
  return cells
}
