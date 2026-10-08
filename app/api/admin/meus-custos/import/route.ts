import { NextRequest, NextResponse } from 'next/server'
import { verifySessionToken, getCookieName } from '@/lib/auth-parceiro'
import { prisma } from '@/lib/prisma'
import * as XLSX from 'xlsx'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function getCompanyIdFromCookie(req: NextRequest): string | null {
  const token = req.cookies.get(getCookieName())?.value
  if (token) {
    const session = verifySessionToken(token)
    if (session) return session.companyId
  }
  const activeCompany = req.cookies.get('psh_session_company')?.value
  if (activeCompany) return activeCompany
  const activeAlt = req.cookies.get('psh_session_active_company')?.value
  if (activeAlt) return activeAlt
  return null
}

/**
 * POST /api/admin/meus-custos/import
 *
 * Aceita arquivo Excel (.xlsx, .xls) ou CSV com colunas SKU + CUSTO (case-insensitive).
 * Faz UPSERT em batch na tabela product_prices (canal='manual').
 *
 * Resposta:
 *   { ok, total_lidos, sucessos, erros: [{linha, sku, motivo}], custo_anterior? }
 */
export async function POST(req: NextRequest) {
  const companyId = getCompanyIdFromCookie(req)
  if (!companyId) {
    return NextResponse.json({ ok: false, error: 'Não logado' }, { status: 401 })
  }

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) {
      return NextResponse.json({ ok: false, error: 'Arquivo não enviado' }, { status: 400 })
    }

    // Lê o arquivo como buffer
    const buffer = Buffer.from(await file.arrayBuffer())

    // Detecta formato
    const filename = file.name.toLowerCase()
    let rows: any[][] = []

    if (filename.endsWith('.csv') || filename.endsWith('.txt')) {
      // Parse CSV simples
      const text = buffer.toString('utf-8')
      const lines = text.split(/\r?\n/).filter(l => l.trim())
      rows = lines.map(line => {
        // Suporta CSV com ; ou ,
        const sep = line.includes(';') ? ';' : ','
        return line.split(sep).map(c => c.trim().replace(/^["']|["']$/g, ''))
      })
    } else {
      // Parse Excel via xlsx
      const wb = XLSX.read(buffer, { type: 'buffer' })
      const sheet = wb.Sheets[wb.SheetNames[0]]
      rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as any[][]
    }

    if (rows.length === 0) {
      return NextResponse.json({ ok: false, error: 'Arquivo vazio' }, { status: 400 })
    }

    // Detecta cabeçalho: primeira linha com "sku" e "custo" (case-insensitive)
    const headerRow = rows[0].map((c: any) => String(c).toLowerCase().trim())
    const skuIdx = headerRow.findIndex((c: string) => c === 'sku' || c === 'mlb' || c === 'codigo' || c === 'código')
    const custoIdx = headerRow.findIndex((c: string) => c === 'custo' || c === 'cost' || c === 'preco_custo' || c === 'preço_custo')

    let dataStart = 1
    let skuCol = skuIdx >= 0 ? skuIdx : 0
    let custoCol = custoIdx >= 0 ? custoIdx : 1

    // Se não tem cabeçalho (ou primeira linha não parece header), assume col 0=sku, 1=custo
    if (skuIdx < 0 && custoIdx < 0) {
      dataStart = 0
      skuCol = 0
      custoCol = 1
    }

    // Coleta pares sku/custo
    type Par = { linha: number; sku: string; custo: number }
    const pares: Par[] = []
    for (let i = dataStart; i < rows.length; i++) {
      const row = rows[i]
      const sku = String(row[skuCol] || '').trim()
      const custoStr = String(row[custoCol] || '').trim().replace(',', '.')
      const custo = Number(custoStr)
      if (!sku) continue
      if (isNaN(custo) || custo < 0) continue
      pares.push({ linha: i + 1, sku, custo })
    }

    if (pares.length === 0) {
      return NextResponse.json({ ok: false, error: 'Nenhuma linha válida encontrada (precisa colunas SKU + CUSTO)' }, { status: 400 })
    }

    // Busca products por SKU
    const skus = [...new Set(pares.map(p => p.sku))]
    const productsRes: any[] = await prisma.$queryRawUnsafe(
      `SELECT id, sku FROM products WHERE sku = ANY($1::text[])`,
      skus,
    )
    const skuToId = new Map<string, string>()
    for (const p of productsRes) skuToId.set(p.sku, p.id)

    // UPSERT em batch
    let sucessos = 0
    const erros: any[] = []

    for (const par of pares) {
      const productId = skuToId.get(par.sku)
      if (!productId) {
        erros.push({ linha: par.linha, sku: par.sku, motivo: 'SKU não encontrado no catálogo' })
        continue
      }
      try {
        await prisma.$executeRawUnsafe(`
          INSERT INTO product_prices (product_id, company_id, preco_venda, custo, canal, updated_at)
          VALUES ($1::uuid, $2::uuid, 0, $3, 'manual'::canal_venda, NOW())
          ON CONFLICT (product_id, canal, company_id) DO UPDATE
          SET custo = EXCLUDED.custo,
              updated_at = NOW()
        `, productId, companyId, par.custo)
        sucessos++
      } catch (e: any) {
        erros.push({ linha: par.linha, sku: par.sku, motivo: e.message })
      }
    }

    return NextResponse.json({
      ok: true,
      total_lidos: pares.length,
      sucessos,
      erros,
      message: `${sucessos} custos atualizados${erros.length > 0 ? `, ${erros.length} erros` : ''}`,
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}