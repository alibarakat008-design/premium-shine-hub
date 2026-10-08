// CRUD /api/b2b/marketplace-accounts
// B2B gerencia suas contas de marketplace vinculadas
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/b2b-auth'
import { auditEvent } from '@/lib/audit-event'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    const session = getSession()
    if (!session) return NextResponse.json({ ok: false, error: 'Não autenticado' }, { status: 401 })

    const contas = await prisma.b2b_marketplace_accounts.findMany({
      where: { b2b_client_id: session.b2b_client_id },
      select: {
        id: true,
        plataforma: true,
        nickname: true,
        account_id: true,
        email: true,
        status: true,
        ultima_sync: true,
        total_pedidos: true,
        total_receita: true,
        created_at: true,
      },
      orderBy: { created_at: 'desc' },
    })

    return NextResponse.json({ ok: true, contas })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = getSession()
    if (!session) return NextResponse.json({ ok: false, error: 'Não autenticado' }, { status: 401 })

    const body = await req.json()
    const { plataforma, nickname, account_id, email, access_token, refresh_token } = body

    if (!plataforma || !nickname) {
      return NextResponse.json({ ok: false, error: 'plataforma e nickname são obrigatórios' }, { status: 400 })
    }

    // Verifica limite de contas por plano
    const client = await prisma.b2b_clients.findUnique({ where: { id: session.b2b_client_id } })
    if (!client) return NextResponse.json({ ok: false, error: 'Cliente não encontrado' }, { status: 404 })

    const totalContas = await prisma.b2b_marketplace_accounts.count({ where: { b2b_client_id: session.b2b_client_id } })
    const limit = client.plano === 'basic' ? 1 : client.plano === 'pro' ? 5 : 999
    if (totalContas >= limit) {
      return NextResponse.json({ ok: false, error: `Limite de ${limit} conta(s) no plano ${client.plano}. Faça upgrade.` }, { status: 403 })
    }

    const conta = await prisma.b2b_marketplace_accounts.create({
      data: {
        b2b_client_id: session.b2b_client_id,
        plataforma: String(plataforma).toLowerCase().trim(),
        nickname: String(nickname).trim(),
        account_id: account_id ? String(account_id).trim() : null,
        email: email ? String(email).toLowerCase().trim() : null,
        access_token: access_token || null,
        refresh_token: refresh_token || null,
        status: 'conectado',
      },
    })

    await auditEvent({
      event_type: 'click',
      page: '/b2b/marketplace',
      action: 'add_marketplace_account',
      metadata: { plataforma, nickname },
    }, { b2b_client_id: session.b2b_client_id })

    return NextResponse.json({ ok: true, conta })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = getSession()
    if (!session) return NextResponse.json({ ok: false, error: 'Não autenticado' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ ok: false, error: 'id obrigatório' }, { status: 400 })

    await prisma.b2b_marketplace_accounts.delete({
      where: { id, b2b_client_id: session.b2b_client_id },
    })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
