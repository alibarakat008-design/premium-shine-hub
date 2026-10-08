// Cron: renova o token ML a cada 30min se vai expirar em < 2h
// Chamado pelo Vercel Cron: 0,30 * * * *
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

export async function GET(req: NextRequest) {
  try {
    // Verificar token Vercel cron
    const authHeader = req.headers.get('authorization') || ''
    const isCronSecret = authHeader === `Bearer ${process.env.CRON_SECRET || ''}`
    const isBasicAuth = authHeader.startsWith('Basic ')
    if (!isCronSecret && !isBasicAuth) {
      if (process.env.NODE_ENV === 'production') {
        return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
      }
    }

    const account = await prisma.marketplace_accounts.findFirst({
      where: { nickname: 'LIURAESSENCE' },
    })
    if (!account) {
      return NextResponse.json({ ok: false, error: 'Conta não encontrada' }, { status: 404 })
    }
    if (!account.refresh_token) {
      return NextResponse.json({ ok: false, error: 'Sem refresh_token' }, { status: 400 })
    }

    // Se o token ainda tem > 2h, não precisa renovar
    if (account.token_expira_em) {
      const horas = (new Date(account.token_expira_em).getTime() - Date.now()) / 3600000
      if (horas > 2) {
        return NextResponse.json({
          ok: true,
          action: 'skip',
          message: `Token ainda válido por ${horas.toFixed(1)}h`,
          expira_em: account.token_expira_em,
        })
      }
    }

    const appId = process.env.ML_CLIENT_ID
    const secretKey = process.env.ML_CLIENT_SECRET
    if (!appId || !secretKey) {
      return NextResponse.json({ ok: false, error: 'ML_CLIENT_ID ou ML_CLIENT_SECRET não configurados' }, { status: 500 })
    }

    const res = await fetch('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: appId,
        client_secret: secretKey,
        refresh_token: account.refresh_token,
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      return NextResponse.json({ ok: false, error: 'Falha no refresh', detail: err.slice(0, 500) }, { status: 500 })
    }

    const data = await res.json()
    await prisma.marketplace_accounts.update({
      where: { id: account.id },
      data: {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        token_expira_em: new Date(Date.now() + (data.expires_in || 21600) * 1000),
        updated_at: new Date(),
      },
    })

    return NextResponse.json({
      ok: true,
      action: 'renewed',
      message: 'Token ML renovado automaticamente',
      expires_in: data.expires_in,
      expires_at: new Date(Date.now() + (data.expires_in || 21600) * 1000).toISOString(),
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
