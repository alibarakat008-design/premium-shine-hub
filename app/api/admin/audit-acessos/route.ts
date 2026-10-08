// GET /api/admin/audit-acessos
// Lista eventos de comportamento (page_view, click, etc) de B2B
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const b2bClientId = searchParams.get('b2b_client_id')
    const eventType = searchParams.get('event_type')
    const page = searchParams.get('page')
    const days = Math.min(Number(searchParams.get('days') || 7), 90)
    const limit = Math.min(Number(searchParams.get('limit') || 200), 1000)

    const where: any = { created_at: { gte: new Date(Date.now() - days * 86400000) } }
    if (b2bClientId) where.b2b_client_id = b2bClientId
    if (eventType && eventType !== 'todos') where.event_type = eventType
    if (page) where.page = page

    const events = await prisma.audit_events.findMany({
      where,
      orderBy: { created_at: 'desc' },
      take: limit,
      include: {
        b2b_clients: { select: { id: true, nome: true, email: true, empresa: true } },
      },
    })

    // Resumo por cliente
    const porCliente = new Map<string, { id: string; nome: string; email: string; count: number; pages: Set<string>; last_seen: string }>()
    const porPage = new Map<string, { page: string; count: number; unique_users: Set<string> }>()
    for (const e of events) {
      if (e.b2b_clients) {
        const cid = e.b2b_clients.id
        if (!porCliente.has(cid)) {
          porCliente.set(cid, { id: cid, nome: e.b2b_clients.nome, email: e.b2b_clients.email, count: 0, pages: new Set(), last_seen: '' })
        }
        const c = porCliente.get(cid)!
        c.count++
        if (e.page) c.pages.add(e.page)
        if (!c.last_seen || (e.created_at && new Date(e.created_at) > new Date(c.last_seen))) c.last_seen = e.created_at?.toISOString() || ''
      }
      if (e.page) {
        if (!porPage.has(e.page)) porPage.set(e.page, { page: e.page, count: 0, unique_users: new Set() })
        const p = porPage.get(e.page)!
        p.count++
        if (e.b2b_client_id) p.unique_users.add(e.b2b_client_id)
      }
    }

    return NextResponse.json({
      ok: true,
      total: events.length,
      eventos: events,
      por_cliente: Array.from(porCliente.values()).map((c) => ({ ...c, pages: Array.from(c.pages), total_pages: c.pages.size })),
      por_page: Array.from(porPage.values()).map((p) => ({ ...p, unique_users: p.unique_users.size })),
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
