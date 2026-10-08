/**
 * API: Alertas Inteligentes
 * GET /api/alertas - lista alertas
 * POST /api/alertas/gerar - gera novos alertas baseados em regras
 * PUT /api/alertas/[id] - marca como lido/resolvido
 *
 * Regras automáticas:
 * 1. preco_fora: produto com preço fora da faixa (preco_venda < custo * 1.2)
 * 2. estoque_critico: produto com estoque < 5 e vendas > 0
 * 3. venda_suspeita: pedido com total muito acima (>5x ticket médio)
 * 4. giro_lento: produto sem vendas há 60+ dias
 * 5. margem_baixa: produto com margem < 10%
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const alertas = await prisma.smart_alerts.findMany({
      orderBy: [{ resolvido: 'asc' }, { created_at: 'desc' }],
      take: 100,
    })
    return NextResponse.json({ success: true, data: alertas })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
