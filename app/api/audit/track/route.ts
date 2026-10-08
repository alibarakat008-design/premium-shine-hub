// POST /api/audit/track
// Cliente B2B chama isso pra registrar page_view, click, etc
// Body: { event_type, page, action, metadata, duration_ms }
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/b2b-auth'
import { auditEvent } from '@/lib/audit-event'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const session = getSession()
    const body = await req.json()
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || req.headers.get('x-real-ip') || ''
    const ua = req.headers.get('user-agent') || ''

    await auditEvent({
      event_type: body.event_type || 'page_view',
      page: body.page,
      action: body.action,
      metadata: body.metadata,
      duration_ms: body.duration_ms,
      ip_address: ip,
      user_agent: ua,
      session_id: body.session_id,
    }, { b2b_client_id: session?.b2b_client_id })

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
