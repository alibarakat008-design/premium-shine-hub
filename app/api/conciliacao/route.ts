/**
 * API: Conciliação Bancária
 * GET /api/conciliacao?mes=2026-06 - lista extrato do mês
 * POST /api/conciliacao/importar - importa CSV/OFX
 *   Body: { transactions: [{ data, descricao, valor, tipo }] }
 * POST /api/conciliacao/match - tenta match automático
 * PUT /api/conciliacao/[id]/match - marca manual
 *   Body: { matched_with, matched_id, confianca }
 * DELETE /api/conciliacao/[id]
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const mes = searchParams.get('mes') // formato YYYY-MM

    let where: any = {}
    if (mes) {
      const [year, month] = mes.split('-').map(Number)
      const inicio = new Date(year, month - 1, 1)
      const fim = new Date(year, month, 1)
      where.data = { gte: inicio, lt: fim }
    }

    const statements = await prisma.bank_statements.findMany({
      where,
      orderBy: { data: 'desc' },
      take: 500,
    })

    // Stats
    const stats = {
      total_creditos: 0,
      total_debitos: 0,
      conciliados: 0,
      pendentes: 0,
    }
    for (const s of statements) {
      if (s.tipo === 'credito') stats.total_creditos += Number(s.valor || 0)
      else stats.total_debitos += Number(s.valor || 0)
      if (s.matched_with) stats.conciliados++
      else stats.pendentes++
    }

    return NextResponse.json({ success: true, data: { statements, stats } })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
