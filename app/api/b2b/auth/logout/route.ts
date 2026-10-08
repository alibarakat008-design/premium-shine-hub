// POST /api/b2b/auth/logout
// Limpa sessão e registra audit
import { NextRequest, NextResponse } from 'next/server'
import { clearSession, getSession } from '@/lib/b2b-auth'
import { auditEvent } from '@/lib/audit-event'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const session = getSession()
    if (session) {
      const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || ''
      await auditEvent({
        event_type: 'logout',
        page: '/b2b',
        ip_address: ip,
        user_agent: req.headers.get('user-agent') || '',
      }, { b2b_client_id: session.b2b_client_id })
    }
    clearSession()
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
