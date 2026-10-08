/**
 * POST /api/admin/backfill-status
 *
 * Re-busca o STATUS atual das vendas (Mercado Livre) e atualiza o DB.
 *
 * Resolve o problema do status "congelado em confirmado" — após o sync inicial,
 * o status da venda nunca é atualizado (delivered, cancelled, etc).
 *
 * Pra cada venda dos últimos X dias (default 7):
 *   1) GET /orders/{id} na ML
 *   2) Mapeia status ML → nosso enum (cancelado, enviado, entregue, etc)
 *   3) UPDATE orders.status WHERE mudou
 *
 * Body: { company_id?: string, days?: number, batch?: number, dry_run?: boolean }
 *
 * Rate limit: ~100 requests por lote com sleep 300ms = ~30s por batch
 */

import { NextRequest, NextResponse } from 'next/server'
import { getMLToken } from '@/lib/ml-auth-multi'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // Vercel Pro permite até 300s; Hobby 60s

const STATUS_MAP: Record<string, string> = {
  paid: 'confirmado',
  handling: 'separado',
  ready_to_ship: 'separado',
  shipped: 'enviado',
  delivered: 'entregue',
  cancelled: 'cancelado',
  // refunded → devolvido (pode vir como refunded no ML)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const companyId = body.company_id
    const days = Math.min(Number(body.days || 7), 90)
    const batch = Math.min(Number(body.batch || 50), 200)
    const dryRun = body.dry_run === true

    const inicio = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

    // Pega vendas da empresa (com token ML) ou todas se for matriz sem filtro
    const where: any = { created_at: { gte: inicio } }
    if (companyId) where.company_id = companyId

    const orders: any[] = await prisma.orders.findMany({
      where,
      orderBy: { created_at: 'desc' },
      take: batch,
      select: {
        id: true,
        order_number: true,
        status: true,
        company_id: true,
        marketplace_account_id: true,
        marketplace_accounts: { select: { access_token: true, refresh_token: true, token_expira_em: true } },
      },
    })

    if (orders.length === 0) {
      return NextResponse.json({ ok: true, message: 'Nenhuma venda no período', days, batch })
    }

    const results: any[] = []
    let updated = 0
    let unchanged = 0
    let errors = 0

    for (const order of orders) {
      try {
        // Pega token com auto-refresh:
        // 1) Se companyId foi passado → getMLToken(companyId) (auto-refresh)
        // 2) Se não → tenta via order.company_id (pega o token da empresa da venda)
        // 3) Fallback: token direto do marketplace_accounts (pode estar expirado)
        let tokenResult: { token: string } | null = null
        const targetCompanyId = companyId || order.company_id
        if (targetCompanyId) {
          tokenResult = await getMLToken(targetCompanyId)
        }
        if (!tokenResult?.token && order.marketplace_accounts?.access_token) {
          tokenResult = { token: order.marketplace_accounts.access_token }
        }
        if (!tokenResult?.token) {
          errors++
          results.push({ order_number: order.order_number, error: 'sem token ML' })
          continue
        }

        // GET /orders/{id} direto na ML
        const mlRes = await fetch(`https://api.mercadolibre.com/orders/${order.order_number}`, {
          headers: { Authorization: `Bearer ${tokenResult.token}` },
        })
        if (!mlRes.ok) {
          errors++
          results.push({ order_number: order.order_number, error: `ML HTTP ${mlRes.status}` })
          continue
        }
        const mlOrder = await mlRes.json()

        const novoStatus = STATUS_MAP[mlOrder.status] || mlOrder.status
        const statusAntigo = order.status

        if (novoStatus === statusAntigo) {
          unchanged++
          continue
        }

        if (!dryRun) {
          await prisma.orders.update({
            where: { id: order.id },
            data: { status: novoStatus },
          })
        }
        updated++
        results.push({
          order_number: order.order_number,
          antes: statusAntigo,
          depois: novoStatus,
          ml_status: mlOrder.status,
        })

        // Rate limit gentil: 300ms entre requests
        await new Promise(r => setTimeout(r, 300))
      } catch (e: any) {
        errors++
        results.push({ order_number: order.order_number, error: e.message })
      }
    }

    return NextResponse.json({
      ok: true,
      dry_run: dryRun,
      company_id: companyId,
      days,
      batch,
      total_processadas: orders.length,
      updated,
      unchanged,
      errors,
      changes: results.filter(r => r.antes && r.depois).slice(0, 20),
      errors_detail: results.filter(r => r.error).slice(0, 10),
      message: dryRun
        ? `DRY RUN: ${updated} vendas precisariam mudar de status.`
        : `${updated} status atualizados, ${unchanged} sem mudança, ${errors} erros.`,
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}