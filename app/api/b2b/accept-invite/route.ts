// POST /api/b2b/accept-invite
// B2B aceita convite: cria conta + seta sessão
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hashPassword, setSession } from '@/lib/b2b-auth'
import { auditEvent } from '@/lib/audit-event'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { token, password, nome, empresa } = body

    if (!token || !password || !nome) {
      return NextResponse.json({ ok: false, error: 'token, senha e nome são obrigatórios' }, { status: 400 })
    }
    if (password.length < 6) {
      return NextResponse.json({ ok: false, error: 'Senha deve ter no mínimo 6 caracteres' }, { status: 400 })
    }

    // Busca convite
    const invite = await prisma.b2b_invites.findUnique({ where: { token } })
    if (!invite) {
      return NextResponse.json({ ok: false, error: 'Convite não encontrado' }, { status: 404 })
    }
    if (invite.status !== 'pendente') {
      return NextResponse.json({ ok: false, error: `Convite já foi ${invite.status}` }, { status: 400 })
    }
    if (new Date() > invite.expira_em) {
      await prisma.b2b_invites.update({ where: { id: invite.id }, data: { status: 'expirado' } })
      return NextResponse.json({ ok: false, error: 'Convite expirado' }, { status: 400 })
    }

    // Verifica se email já cadastrado
    const existing = await prisma.b2b_clients.findUnique({ where: { email: invite.email } })
    if (existing) {
      return NextResponse.json({ ok: false, error: 'Email já cadastrado' }, { status: 409 })
    }

    // Cria conta
    const trialAte = new Date()
    trialAte.setDate(trialAte.getDate() + 14)

    const client = await prisma.b2b_clients.create({
      data: {
        email: invite.email,
        password_hash: hashPassword(password),
        nome: String(nome).trim(),
        empresa: empresa || invite.empresa || null,
        plano: invite.plano,
        status: 'trial',
        trial_ate: trialAte,
        ultimo_login: new Date(),
      },
    })

    // Marca convite como aceito
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || req.headers.get('x-real-ip') || ''
    await prisma.b2b_invites.update({
      where: { id: invite.id },
      data: {
        status: 'aceito',
        aceito_em: new Date(),
        aceito_por: client.id,
        ip_aceito: ip,
      },
    })

    // Sessão
    setSession(client.id, client.email, client.nome)

    // Audit
    await auditEvent({
      event_type: 'login',
      page: '/b2b/aceitar-convite',
      action: 'invite_accepted',
      ip_address: ip,
      user_agent: req.headers.get('user-agent') || '',
      metadata: { invite_id: invite.id, plano: invite.plano },
    }, { b2b_client_id: client.id })

    return NextResponse.json({
      ok: true,
      client: {
        id: client.id,
        email: client.email,
        nome: client.nome,
        empresa: client.empresa,
        plano: client.plano,
        trial_ate: trialAte.toISOString(),
      },
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

// GET: valida token (sem aceitar)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const token = searchParams.get('token')
    if (!token) return NextResponse.json({ ok: false, error: 'token obrigatório' }, { status: 400 })

    const invite = await prisma.b2b_invites.findUnique({ where: { token } })
    if (!invite) return NextResponse.json({ ok: false, error: 'Convite não encontrado' }, { status: 404 })
    if (invite.status !== 'pendente') {
      return NextResponse.json({ ok: false, valid: false, status: invite.status, error: `Convite ${invite.status}` })
    }
    if (new Date() > invite.expira_em) {
      return NextResponse.json({ ok: false, valid: false, status: 'expirado', error: 'Convite expirado' })
    }

    return NextResponse.json({
      ok: true,
      valid: true,
      invite: {
        email: invite.email,
        nome: invite.nome,
        empresa: invite.empresa,
        plano: invite.plano,
        mensagem: invite.mensagem,
        expira_em: invite.expira_em,
      },
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
