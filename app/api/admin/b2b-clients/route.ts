// GET /api/admin/b2b-clients
// Admin lista/cliente B2B com estatísticas de uso
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    const clients = await prisma.b2b_clients.findMany({
      orderBy: { created_at: 'desc' },
      include: {
        _count: { select: { marketplace_accounts: true, audit_events: true } },
      },
    })

    // Stats agregadas
    const enriched = await Promise.all(clients.map(async (c) => {
      const eventosRecentes = await prisma.audit_events.count({
        where: { b2b_client_id: c.id, created_at: { gte: new Date(Date.now() - 7 * 86400000) } },
      })
      const totalEventos = await prisma.audit_events.count({ where: { b2b_client_id: c.id } })
      const lastEvent = await prisma.audit_events.findFirst({
        where: { b2b_client_id: c.id },
        orderBy: { created_at: 'desc' },
        select: { created_at: true, event_type: true, page: true },
      })

      return {
        ...c,
        password_hash: undefined,
        stats: {
          eventos_7d: eventosRecentes,
          eventos_total: totalEventos,
          ultimo_evento: lastEvent,
        },
      }
    }))

    return NextResponse.json({ ok: true, clientes: enriched })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
