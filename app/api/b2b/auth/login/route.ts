// POST /api/b2b/auth/login
// Login B2B: valida credenciais e cria sessão
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyPassword, setSession } from '@/lib/b2b-auth'
import { auditEvent } from '@/lib/audit-event'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { email, password } = body

    if (!email || !password) {
      return NextResponse.json({ ok: false, error: 'Email e senha obrigatórios' }, { status: 400 })
    }

    const client = await prisma.b2b_clients.findUnique({
      where: { email: String(email).toLowerCase().trim() },
    })
    if (!client) {
      return NextResponse.json({ ok: false, error: 'Email ou senha inválidos' }, { status: 401 })
    }
    if (client.status === 'inativo' || client.status === 'bloqueado') {
      return NextResponse.json({ ok: false, error: 'Conta inativa. Entre em contato com o suporte.' }, { status: 403 })
    }
    if (!verifyPassword(password, client.password_hash)) {
      return NextResponse.json({ ok: false, error: 'Email ou senha inválidos' }, { status: 401 })
    }

    // Cria sessão
    setSession(client.id, client.email, client.nome)

    // Atualiza ultimo_login
    await prisma.b2b_clients.update({
      where: { id: client.id },
      data: { ultimo_login: new Date() },
    })

    // Audit event
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || req.headers.get('x-real-ip') || ''
    await auditEvent({
      event_type: 'login',
      page: '/b2b/login',
      action: 'login_success',
      ip_address: ip,
      user_agent: req.headers.get('user-agent') || '',
      metadata: { email: client.email },
    }, { b2b_client_id: client.id })

    return NextResponse.json({
      ok: true,
      client: {
        id: client.id,
        email: client.email,
        nome: client.nome,
        empresa: client.empresa,
        plano: client.plano,
        avatar_url: client.avatar_url,
      },
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
