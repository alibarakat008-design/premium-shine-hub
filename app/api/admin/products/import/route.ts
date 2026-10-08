// POST /api/admin/products/import
// Recebe CSV (text/csv) e atualiza produtos em massa
// Colunas reconhecidas: sku, preco_venda, preco_promocional, custo, estoque, ativo, destaque
// Se ativo=false → desativa o produto (soft delete)
// Tudo idempotente (pode rodar várias vezes)

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { audit, auditFromRequest } from '@/lib/audit'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') || ''

    let rows: any[] = []
    if (contentType.includes('application/json')) {
      const body = await req.json()
      const data = body.data || body.rows || body
      rows = (Array.isArray(data) ? data : []).map((r: any) => ({
        sku: String(r.sku || '').trim(),
        preco_venda: r.preco_venda !== undefined ? Number(String(r.preco_venda).replace(',', '.')) : undefined,
        preco_promocional: r.preco_promocional !== undefined ? Number(String(r.preco_promocional).replace(',', '.')) : undefined,
        custo: r.custo !== undefined ? Number(String(r.custo).replace(',', '.')) : undefined,
        estoque: r.estoque !== undefined ? Number(String(r.estoque).replace(',', '.')) : undefined,
        ativo: r.ativo !== undefined ? String(r.ativo).toLowerCase() === 'sim' || r.ativo === true : undefined,
        destaque: r.destaque !== undefined ? String(r.destaque).toLowerCase() === 'sim' || r.destaque === true : undefined,
      })).filter((r: any) => r.sku)
    } else {
      const text = await req.text()
      rows = parseCSV(text)
    }

    if (rows.length === 0) {
      return NextResponse.json({ ok: false, error: 'Nenhuma linha com SKU encontrada' }, { status: 400 })
    }

    const skus = [...new Set(rows.map((r) => r.sku))]
    const products = await prisma.products.findMany({
      where: { sku: { in: skus } },
      select: {
        id: true,
        sku: true,
        product_prices: { where: { canal: 'mercado_livre' }, select: { id: true }, take: 1 },
        inventory: { select: { id: true } },
      },
    })

    const productMap = new Map(products.map((p) => [p.sku, p]))

    let updatedProducts = 0
    let updatedPrices = 0
    let updatedStock = 0
    let skipped = 0
    const results: any[] = []
    const errors: string[] = []

    for (const row of rows) {
      const product = productMap.get(row.sku)
      if (!product) {
        skipped++
        results.push({ sku: row.sku, status: 'nao_encontrado' })
        continue
      }

      try {
        // 1) Atualiza flags do produto
        const updateProduct: any = {}
        if (row.ativo !== undefined) updateProduct.ativo = row.ativo
        if (row.destaque !== undefined) updateProduct.destaque = row.destaque
        if (Object.keys(updateProduct).length > 0) {
          await prisma.products.update({
            where: { id: product.id },
            data: updateProduct,
          })
          updatedProducts++
        }

        // 2) Atualiza preço ML
        if (row.preco_venda !== undefined || row.preco_promocional !== undefined || row.custo !== undefined) {
          const data: any = {}
          if (row.preco_venda !== undefined) data.preco_venda = row.preco_venda
          if (row.preco_promocional !== undefined) data.preco_promocional = row.preco_promocional
          if (row.custo !== undefined) data.custo = row.custo

          if (product.product_prices && product.product_prices.length > 0) {
            await prisma.product_prices.update({
              where: { id: product.product_prices[0].id },
              data,
            })
          } else {
            await prisma.product_prices.create({
              data: {
                product_id: product.id,
                canal: 'mercado_livre',
                preco_venda: row.preco_venda || 0,
                custo: row.custo || null,
                preco_promocional: row.preco_promocional || null,
              },
            })
          }
          updatedPrices++
        }

        // 3) Atualiza estoque
        if (row.estoque !== undefined) {
          if (product.inventory) {
            await prisma.inventory.update({
              where: { id: product.inventory.id },
              data: { quantidade_atual: Math.max(0, Math.floor(row.estoque)) },
            })
          } else {
            await prisma.inventory.create({
              data: {
                product_id: product.id,
                quantidade_atual: Math.max(0, Math.floor(row.estoque)),
                quantidade_minima: 5,
              },
            })
          }
          updatedStock++
        }

        results.push({ sku: row.sku, status: 'ok' })
      } catch (err: any) {
        errors.push(`${row.sku}: ${err.message?.slice(0, 100)}`)
        results.push({ sku: row.sku, status: 'erro', erro: err.message?.slice(0, 100) })
      }
    }

    // Audit log consolidado da operação
    if (updatedProducts + updatedPrices + updatedStock > 0) {
      const ctx = auditFromRequest(req)
      await audit({
        acao: 'product.update',
        tabela: 'products',
        dados_novos: {
          total_alteracoes: updatedProducts + updatedPrices + updatedStock,
          produtos: updatedProducts,
          precos: updatedPrices,
          estoques: updatedStock,
          nao_encontrados: skipped,
        },
        ...ctx,
        metadata: { origem: 'csv_import', erros: errors.slice(0, 10) },
      })
    }

    return NextResponse.json({
      ok: true,
      total_linhas: rows.length,
      produtos_atualizados: updatedProducts,
      precos_atualizados: updatedPrices,
      estoques_atualizados: updatedStock,
      nao_encontrados: skipped,
      erros: errors.length,
      results: results.slice(0, 100),
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message, stack: err.stack }, { status: 500 })
  }
}

function parseCSV(text: string): any[] {
  const clean = text.replace(/^\uFEFF/, '').trim()
  const lines = clean.split(/\r?\n/)
  if (lines.length < 2) return []

  const sep = lines[0].includes(';') ? ';' : ','
  const headers = lines[0].split(sep).map((h) => h.trim().toLowerCase().replace(/^"|"$/g, ''))
  const idxSku = headers.findIndex((h) => h.includes('sku'))
  if (idxSku < 0) return []

  const rows: any[] = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const cells = parseCSVLine(line, sep).map((c) => c.replace(/^"|"$/g, ''))
    const sku = cells[idxSku]?.trim()
    if (!sku) continue

    const row: any = { sku }
    for (let h = 0; h < headers.length; h++) {
      const key = headers[h]
      const val = cells[h]
      if (key === 'sku') continue
      if (key === 'preco_venda' || key === 'preço_venda' || key === 'preco_ml' || key === 'preço' || key === 'preco' || key === 'price') {
        row.preco_venda = Number(val?.replace(',', '.'))
      } else if (key === 'preco_promocional' || key === 'preço_promocional' || key === 'promo' || key === 'preco_promo') {
        row.preco_promocional = Number(val?.replace(',', '.'))
      } else if (key === 'custo' || key === 'cost') {
        row.custo = Number(val?.replace(',', '.'))
      } else if (key === 'estoque' || key === 'stock' || key === 'qty') {
        row.estoque = Number(val)
      } else if (key === 'ativo' || key === 'active') {
        row.ativo = val === 'sim' || val === '1' || val === 'true' || val === 's'
      } else if (key === 'destaque' || key === 'highlight' || key === 'featured') {
        row.destaque = val === 'sim' || val === '1' || val === 'true' || val === 's'
      }
    }
    rows.push(row)
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
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (c === sep && !inQuotes) {
      cells.push(current)
      current = ''
    } else {
      current += c
    }
  }
  cells.push(current)
  return cells
}
