/**
 * GET /api/admin/promo-scenarios/[id]/raw
 * Retorna o payload bruto da última consulta (para diagnóstico)
 */
import { NextRequest, NextResponse } from 'next/server'
import { isMatrizRequest } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isMatrizRequest(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  try {
    const query = await prisma.promo_latest_queries.findUnique({ where: { scenario_id: params.id } })
    if (!query) return NextResponse.json({ ok: false, error: 'Nenhum dado salvo.' }, { status: 404 })

    // Sanitizar: remover tokens, secrets
    const raw = JSON.parse(JSON.stringify(query.raw_payload || []))
    const sanitized = raw.map((item: any) => {
      const clean: any = { ...item }
      const sensitiveKeys = ['access_token', 'refresh_token', 'token', 'secret', 'password', 'api_key']
      for (const key of sensitiveKeys) {
        if (clean[key]) clean[key] = '[REMOVIDO]'
      }
      return clean
    })

    return NextResponse.json({
      ok: true,
      raw_payload: sanitized,
      fetched_at: query.fetched_at,
      mlb_at_query: query.mlb_at_query,
      notice: 'Dados brutos do Mercado Livre (tokens e secrets removidos).',
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
