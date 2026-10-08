/**
 * POST /api/admin/promo-scenarios/import
 * Importa cenários em lote via arquivo CSV ou XLSX.
 *
 * Aceita multipart/form-data com campo "file".
 * Faz UPSERT por MLB — cria novo se não existe, atualiza critérios se já existe.
 * Cenários nascem INATIVOS (o usuário ativa depois de revisar).
 *
 * Colunas esperadas no CSV:
 *   mlb, nome_produto, teto_desconto_seller_pct, preco_minimo, valor_minimo_a_receber, modo
 */
import { NextRequest, NextResponse } from 'next/server'
import { isMatrizRequest } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

interface ParsedRow {
  mlb: string
  nome_produto: string
  teto_desconto_seller_pct: string
  preco_minimo: string
  valor_minimo_a_receber: string
  modo: string
  errors: string[]
}

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return { headers: [], rows: [] }

  // Parse header
  const parseRow = (line: string): string[] => {
    const result: string[] = []
    let current = ''
    let inQuotes = false
    for (const ch of line) {
      if (ch === '"') {
        inQuotes = !inQuotes
      } else if (ch === ',' && !inQuotes) {
        result.push(current.trim())
        current = ''
      } else {
        current += ch
      }
    }
    result.push(current.trim())
    return result
  }

  const headers = parseRow(lines[0])
  const rows = lines.slice(1).map(parseRow).filter(r => r.some(c => c.trim()))
  return { headers, rows }
}

function parseRow(headers: string[], row: string[]): ParsedRow {
  const get = (col: string): string => {
    const idx = headers.findIndex(h => h.toLowerCase().trim() === col.toLowerCase().trim())
    return idx >= 0 && idx < row.length ? (row[idx] || '').trim() : ''
  }

  return {
    mlb: get('mlb'),
    nome_produto: get('nome_produto') || get('nome') || get('product_name') || get('title'),
    teto_desconto_seller_pct: get('teto_desconto_seller_pct') || get('teto') || get('max_seller'),
    preco_minimo: get('preco_minimo') || get('preco_min') || get('min_price') || get('price_min'),
    valor_minimo_a_receber: get('valor_minimo_a_receber') || get('receb_min') || get('min_net') || get('net_min'),
    modo: get('modo') || get('mode') || get('activation_mode'),
    errors: [],
  }
}

function validateRow(row: ParsedRow): void {
  if (!row.mlb) row.errors.push('MLB obrigatório')
  if (!row.nome_produto) row.errors.push('Nome do produto obrigatório')

  if (row.modo && !['conservador', 'agressivo', 'conservative', 'aggressive'].includes(row.modo.toLowerCase())) {
    row.errors.push(`Modo inválido: "${row.modo}" (use "conservador" ou "agressivo")`)
  }

  if (row.teto_desconto_seller_pct && isNaN(Number(row.teto_desconto_seller_pct))) {
    row.errors.push(`Teto de desconto inválido: "${row.teto_desconto_seller_pct}"`)
  }
  if (row.preco_minimo && isNaN(Number(row.preco_minimo.replace(',', '.')))) {
    row.errors.push(`Preço mínimo inválido: "${row.preco_minimo}"`)
  }
  if (row.valor_minimo_a_receber && isNaN(Number(row.valor_minimo_a_receber.replace(',', '.')))) {
    row.errors.push(`Valor mínimo a receber inválido: "${row.valor_minimo_a_receber}"`)
  }

  const temCrit = row.teto_desconto_seller_pct || row.preco_minimo || row.valor_minimo_a_receber
  if (!temCrit) {
    row.errors.push('Pelo menos um critério financeiro é obrigatório')
  }
}

export async function POST(req: NextRequest) {
  if (!isMatrizRequest(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  try {
    let fileText: string
    let filename = 'unknown'

    const contentType = req.headers.get('content-type') || ''

    if (contentType.includes('multipart/form-data')) {
      // Parse multipart
      const formData = await req.formData()
      const file = formData.get('file') as File | null
      if (!file) return NextResponse.json({ ok: false, error: 'Arquivo não enviado.' }, { status: 400 })
      filename = file.name
      fileText = await file.text()
    } else {
      // Assume JSON com lines CSV
      const body = await req.json()
      if (body.csv) fileText = body.csv
      else return NextResponse.json({ ok: false, error: 'Envie um arquivo CSV.' }, { status: 400 })
    }

    if (!filename.toLowerCase().endsWith('.csv') && !filename.toLowerCase().endsWith('.xlsx')) {
      return NextResponse.json({ ok: false, error: 'Apenas arquivos CSV ou XLSX são aceitos.' }, { status: 400 })
    }

    // Parse CSV
    const { rows } = parseCSV(fileText)
    if (rows.length === 0) {
      return NextResponse.json({ ok: false, error: 'Nenhuma linha encontrada no arquivo.' }, { status: 400 })
    }

    const headers = rows[0] ? Object.keys(rows[0]).map(k => k) : []
    const { headers: h, rows: dataRows } = parseCSV(fileText)
    if (dataRows.length === 0) {
      return NextResponse.json({ ok: false, error: 'Nenhuma linha de dados encontrada.' }, { status: 400 })
    }

    // Parse cada linha
    const parsedRows: ParsedRow[] = dataRows.map((row: string[]) => parseRow(h, row))
    parsedRows.forEach(validateRow)

    const errors: string[] = []
    let created = 0
    let updated = 0
    const historyEntries: any[] = []

    for (const row of parsedRows) {
      if (row.errors.length > 0) {
        errors.push(`Linha ${row.mlb || '(sem MLB)'}: ${row.errors.join(', ')}`)
        continue
      }

      const existing = await prisma.promo_scenarios.findUnique({ where: { mlb: row.mlb } })

      const data = {
        product_name: row.nome_produto,
        mlb: row.mlb,
        max_seller_discount_pct: row.teto_desconto_seller_pct ? parseFloat(row.teto_desconto_seller_pct.replace(',', '.')) : null,
        min_sale_price: row.preco_minimo ? parseFloat(row.preco_minimo.replace(',', '.')) : null,
        min_net_receivable: row.valor_minimo_a_receber ? parseFloat(row.valor_minimo_a_receber.replace(',', '.')) : null,
        activation_mode: (['agressivo', 'aggressive'].includes(row.modo.toLowerCase()) ? 'aggressive' : 'conservative'),
        // Cenário nascem INATIVOS — usuário ativa depois de revisar
        active: false,
      }

      if (existing) {
        // Atualizar apenas critérios — preservar active, não reativar sozinho
        await prisma.promo_scenarios.update({
          where: { id: existing.id },
          data: {
            product_name: data.product_name,
            max_seller_discount_pct: data.max_seller_discount_pct,
            min_sale_price: data.min_sale_price,
            min_net_receivable: data.min_net_receivable,
            activation_mode: data.activation_mode,
            // NÃO tocar active — preserva estado atual
          },
        })
        historyEntries.push({
          scenario_id: existing.id,
          event_type: 'criterion_changed',
          new_values: { imported: true, source: 'batch_import', ...data },
        })
        updated++
      } else {
        const newScenario = await prisma.promo_scenarios.create({ data })
        historyEntries.push({
          scenario_id: newScenario.id,
          event_type: 'scenario_created',
          new_values: { imported: true, source: 'batch_import', ...data },
        })
        created++
      }
    }

    // Salvar histórico em batch
    for (const entry of historyEntries) {
      try {
        await prisma.promo_scenario_history.create({ data: entry })
      } catch { /* não falhar por histórico */ }
    }

    return NextResponse.json({
      ok: true,
      created,
      updated,
      errors: errors.length > 0 ? errors : undefined,
      summary: `${created} criado(s), ${updated} atualizado(s). Cenários nascem inativos — ative depois de revisar.`,
    })
  } catch (err: any) {
    console.error('[promo-scenarios/import]', err)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
