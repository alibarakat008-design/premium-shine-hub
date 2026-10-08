// /lib/audit-event.ts
// Helper pra registrar eventos de comportamento do usuário
// - page_view: visita a uma página
// - click: clique em botão/link específico
// - api_call: requisição a API interna
// - login/logout: autenticação
// - export: download de CSV/PDF
// - download: arquivo baixado
// - form_submit: envio de formulário

import { prisma } from './prisma'
import { cookies } from 'next/headers'

export interface AuditEventInput {
  event_type: 'page_view' | 'click' | 'api_call' | 'login' | 'logout' | 'export' | 'download' | 'form_submit' | 'error' | string
  page?: string
  action?: string
  metadata?: any
  ip_address?: string
  user_agent?: string
  session_id?: string
  duration_ms?: number
}

export async function auditEvent(input: AuditEventInput, ctx?: { user_id?: string; b2b_client_id?: string }) {
  try {
    // Auto-detecta user_id do cookie se não fornecido
    let userId = ctx?.user_id
    let b2bClientId = ctx?.b2b_client_id

    if (!userId && !b2bClientId) {
      try {
        const cookieStore = cookies()
        const sessionCookie = cookieStore.get('b2b_session')?.value
        if (sessionCookie) {
          const session = JSON.parse(decodeURIComponent(sessionCookie))
          b2bClientId = session.b2b_client_id
        }
      } catch { /* sem cookies disponíveis */ }
    }

    await prisma.audit_events.create({
      data: {
        event_type: input.event_type,
        page: input.page,
        action: input.action,
        metadata: input.metadata || null,
        ip_address: input.ip_address,
        user_agent: input.user_agent,
        session_id: input.session_id,
        duration_ms: input.duration_ms,
        user_id: userId,
        b2b_client_id: b2bClientId,
      },
    })
  } catch (err) {
    // Não bloqueia a operação principal
    console.error('[auditEvent] falhou:', err)
  }
}
