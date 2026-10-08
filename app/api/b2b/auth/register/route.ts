// POST /api/b2b/auth/register
// Cadastro B2B: cria conta + trial de 14 dias
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hashPassword, setSession } from '@/lib/b2b-auth'
import { auditEvent } from '@/lib/audit-event'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { email, password, nome, empresa, cnpj, telefone } = body

    if (!email || !password || !nome) {
      return NextResponse.json({ ok: false, error: 'Email, senha e nome são obrigatórios' }, { status: 400 })
    }
    if (password.length < 6) {
      return NextResponse.json({ ok: false, error: 'Senha deve ter no mínimo 6 caracteres' }, { status: 400 })
    }

    const emailNorm = String(email).toLowerCase().trim()

    // Verifica se já existe
    const existing = await prisma.b2b_clients.findUnique({ where: { email: emailNorm } })
    if (existing) {
      return NextResponse.json({ ok: false, error: 'Email já cadastrado' }, { status: 409 })
    }

    // Cria conta
    const trialAte = new Date()
    trialAte.setDate(trialAte.getDate() + 14)

    const client = await prisma.b2b_clients.create({
      data: {
        email: emailNorm,
        password_hash: hashPassword(password),
        nome: String(nome).trim(),
        empresa: empresa ? String(empresa).trim() : null,
        cnpj: cnpj ? String(cnpj).replace(/\D/g, '') : null,
        telefone: telefone ? String(telefone).replace(/\D/g, '') : null,
        plano: 'basic',
        status: 'trial',
        trial_ate: trialAte,
        ultimo_login: new Date(),
      },
    })

    // Sessão
    setSession(client.id, client.email, client.nome)

    // Audit
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || req.headers.get('x-real-ip') || ''
    await auditEvent({
      event_type: 'login',
      page: '/b2b/register',
      action: 'register',
      ip_address: ip,
      user_agent: req.headers.get('user-agent') || '',
      metadata: { email: client.email, plano: 'basic', trial_ate: trialAte.toISOString() },
    }, { b2b_client_id: client.id })

    return NextResponse.json({
      ok: true,
      client: {
        id: client.id,
        email: client.email,
        nome: client.nome,
        empresa: client.empresa,
        plano: client.plano,
        status: client.status,
        trial_ate: trialAte.toISOString(),
      },
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
