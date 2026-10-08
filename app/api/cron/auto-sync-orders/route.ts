/**
 * GET /api/cron/auto-sync-orders
 *
 * Cron Vercel: roda a cada 1 minuto.
 * Sincroniza TODAS as contas ML parceiras (última 1h de cada).
 *
 * Chamado pelo vercel.json: { "path": "/api/cron/auto-sync-orders", "schedule": "* * * * *" }
 *
 * Protegido por CRON_SECRET (header Authorization Bearer).
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getMLToken } from '@/lib/ml-auth-multi'
import { syncOrdersFromML } from '@/lib/mercadolivre/sync'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || ''
  const expectedAuth = `Bearer ${process.env.CRON_SECRET || 'shinecron2026'}`
  if (authHeader !== expectedAuth) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  try {
    // Pega todas as contas ML
    const accounts: any = await prisma.$queryRawUnsafe(`
      SELECT ma.id, ma.account_id, ma.company_id, ma.nickname, c.access_token_ml IS NOT NULL as has_company_token
      FROM marketplace_accounts ma
      JOIN companies c ON c.id = ma.company_id
      WHERE ma.plataforma = 'mercado_livre'
    `)

    const results: any[] = []
    for (const acc of accounts) {
      try {
        // Verifica token (pega da company se tiver, senão da matriz)
        const tokenRes = await getMLToken(acc.company_id)
        if (!tokenRes?.token) {
          results.push({ account: acc.nickname, status: 'no_token' })
          continue
        }

        // Sync 1h
        const syncResult = await syncOrdersFromML(String(acc.id), { days: 1, all: false, limit: 50 })
        results.push({
          account: acc.nickname,
          account_id: acc.account_id,
          fetched: syncResult.total,
          created: syncResult.criados,
          erros: syncResult.erros.length,
        })
      } catch (e: any) {
        results.push({ account: acc.nickname, status: 'error', error: e.message?.substring(0, 100) })
      }
    }

    return NextResponse.json({
      ok: true,
      ts: new Date().toISOString(),
      results,
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}