// CRUD /api/admin/b2b-invites
// Admin envia convites por email pra novos B2Bs
// GET: lista todos
// POST: cria convite (gera token único)
// DELETE: revoga convite pendente

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')

    const where: any = {}
    if (status && status !== 'todos') where.status = status

    const invites = await prisma.b2b_invites.findMany({
      where,
      orderBy: { created_at: 'desc' },
      take: 200,
    })

    return NextResponse.json({ ok: true, convites: invites })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { email, nome, empresa, mensagem, plano } = body

    if (!email) {
      return NextResponse.json({ ok: false, error: 'Email obrigatório' }, { status: 400 })
    }

    const emailNorm = String(email).toLowerCase().trim()

    // Verifica se já existe cliente com esse email
    const existingClient = await prisma.b2b_clients.findUnique({ where: { email: emailNorm } })
    if (existingClient) {
      return NextResponse.json({ ok: false, error: 'Já existe um cliente B2B com este email' }, { status: 409 })
    }

    // Verifica se já tem convite pendente
    const existing = await prisma.b2b_invites.findFirst({
      where: { email: emailNorm, status: 'pendente' },
    })
    if (existing) {
      return NextResponse.json({ ok: false, error: 'Já existe convite pendente para este email', invite: existing }, { status: 409 })
    }

    // Gera token único
    const token = crypto.randomBytes(32).toString('hex')
    const expiraEm = new Date()
    expiraEm.setDate(expiraEm.getDate() + 14) // 14 dias

    const invite = await prisma.b2b_invites.create({
      data: {
        email: emailNorm,
        nome: nome || null,
        empresa: empresa || null,
        token,
        mensagem: mensagem || null,
        plano: plano || 'basic',
        expira_em: expiraEm,
      },
    })

    // Aqui você chamaria sua API de email (SendGrid, Resend, etc)
    // Por enquanto, retornamos o link pra você copiar
    const link = `${process.env.NEXT_PUBLIC_URL || 'https://premium-shine-hub.vercel.app'}/b2b/aceitar-convite/${token}`

    return NextResponse.json({
      ok: true,
      invite,
      link,
      message: `Convite criado! Link: ${link}`,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message, stack: err.stack }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ ok: false, error: 'id obrigatório' }, { status: 400 })

    await prisma.b2b_invites.update({
      where: { id },
      data: { status: 'revogado' },
    })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
