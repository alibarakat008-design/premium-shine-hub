/**
 * API: Match automático de transações bancárias com pedidos
 * POST /api/conciliacao/match
 *
 * Para cada statement sem match, tenta encontrar:
 * - Order com total próximo (diferença < R$ 0.10)
 * - Mesmo dia ±3 dias
 *
 * Define matched_with=order, matched_id=order_id, confianca=80-100
 */

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST() {
  try {
    const statements = await prisma.bank_statements.findMany({
      where: { matched_with: null, tipo: 'credito' },
    })

    let matched = 0
    for (const stmt of statements) {
      if (!stmt.data || !stmt.valor) continue
      const valor = Number(stmt.valor)
      const dataInicio = new Date(stmt.data)
      dataInicio.setDate(dataInicio.getDate() - 3)
      const dataFim = new Date(stmt.data)
      dataFim.setDate(dataFim.getDate() + 3)

      // Procurar order com total próximo
      const orders = await prisma.orders.findMany({
        where: {
          total: { gte: valor - 0.1, lte: valor + 0.1 },
          created_at: { gte: dataInicio, lte: dataFim },
          status: { in: ['confirmado', 'separado', 'enviado', 'entregue'] },
        },
        take: 5,
      })

      if (orders.length > 0) {
        // Match com o mais próximo
        const ordem = orders.sort((a, b) => {
          const dA = Math.abs(new Date(a.created_at!).getTime() - stmt.data.getTime())
          const dB = Math.abs(new Date(b.created_at!).getTime() - stmt.data.getTime())
          return dA - dB
        })[0]

        // Calcular confiança baseada na proximidade da data
        const dias = Math.abs((new Date(ordem.created_at!).getTime() - stmt.data.getTime()) / (1000 * 60 * 60 * 24))
        const confianca = Math.max(50, 100 - dias * 10)

        await prisma.bank_statements.update({
          where: { id: stmt.id },
          data: { matched_with: 'order', matched_id: ordem.id, confianca },
        })
        matched++
      } else {
        // Tentar match por descrição (referências)
        const descNum = stmt.descricao?.match(/\d{4,}/)?.[0]
        if (descNum) {
          const order = await prisma.orders.findFirst({
            where: {
              OR: [
                { id: descNum },
              ],
            },
          })
          if (order) {
            await prisma.bank_statements.update({
              where: { id: stmt.id },
              data: { matched_with: 'order', matched_id: order.id, confianca: 70 },
            })
            matched++
          }
        }
      }
    }

    return NextResponse.json({ success: true, message: `${matched} transações conciliadas`, data: { matched } })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
