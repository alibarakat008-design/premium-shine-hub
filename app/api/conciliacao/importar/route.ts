/**
 * API: Importar extrato bancário (CSV ou OFX)
 * POST /api/conciliacao/importar
 *   Body: { transactions: [{ data, descricao, valor, tipo }] }
 *
 * Aceita CSV formato: data;descricao;valor;tipo
 * ou JSON com array de transactions
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { transactions, csvText } = body

    let transacoes: any[] = transactions || []

    // Parse CSV se enviado como texto
    if (csvText && !transacoes.length) {
      const linhas = csvText.split('\n').filter((l: string) => l.trim())
      // Pular header
      for (let i = 1; i < linhas.length; i++) {
        const cols = linhas[i].split(/[;,]/).map((c: string) => c.trim().replace(/^"|"$/g, ''))
        if (cols.length >= 4) {
          transacoes.push({
            data: cols[0],
            descricao: cols[1],
            valor: parseFloat(cols[2].replace(',', '.')),
            tipo: cols[3] || (parseFloat(cols[2]) > 0 ? 'credito' : 'debito'),
          })
        }
      }
    }

    if (transacoes.length === 0) {
      return NextResponse.json({ success: false, error: 'Nenhuma transação para importar' }, { status: 400 })
    }

    const created = []
    for (const t of transacoes) {
      // Validar
      if (!t.data || !t.valor || !t.descricao) continue
      const data = new Date(t.data)
      if (isNaN(data.getTime())) continue
      const valor = Math.abs(parseFloat(t.valor))
      const tipo = t.tipo || (parseFloat(t.valor) > 0 ? 'credito' : 'debito')

      const stmt = await prisma.bank_statements.create({
        data: {
          data,
          descricao: t.descricao.substring(0, 255),
          valor,
          tipo,
        },
      })
      created.push(stmt)
    }

    return NextResponse.json({ success: true, message: `${created.length} transações importadas`, data: { total: created.length } })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
