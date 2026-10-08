/**
 * =====================================================
 * API DE LOGS DE CRON
 * =====================================================
 * GET /api/cron/logs — Lista execuções recentes
 * =====================================================
 */

// app/api/cron/logs/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {

  const { searchParams } = new URL(request.url)
  const tipo = searchParams.get('tipo')
  const limit = Number(searchParams.get('limit') || 30)

  const where: any = {}
  if (tipo) where.tipo = tipo

  // Logs desabilitados - tabela cron_logs não existe
  const logs: any[] = []
  // const logs = await prisma.cron_logs.findMany({
  //   where,
  //   orderBy: { started_at: 'desc' },
  //   take: limit,
  // })

  // Stats agregados
  const stats = { _count: 0, _avg: { duration_ms: 0 } }
  // const stats = await prisma.cron_logs.aggregate({
  //   _count: true,
  //   _avg: { duration_ms: true },
  // })

  return NextResponse.json({
    success: true,
    data: logs,
    stats: {
      total_execucoes: stats._count,
      duracao_media_ms: Math.round(stats._avg.duration_ms || 0),
    },
  })
}
