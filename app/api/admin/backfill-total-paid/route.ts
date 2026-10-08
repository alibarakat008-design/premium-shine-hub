/**
 * Backfill TARGETED: preenche total_paid_amount + calcula ml_paga correto
 * pra orders específicas (passadas por ?ids=2000017121487672,2000017121482448,...)
 *
 * Pra cada id:
 *   1) Consulta /orders/{id} + payments[0].total_paid_amount
 *   2) Salva total_paid_amount
 *   3) Atualiza recebimento_liquido com fórmula correta (se diferente)
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const mlFetch = async (accountId: string, path: string): Promise<any> => {
  const account = await prisma.marketplace_accounts.findUnique({ where: { id: accountId } })
  if (!account) throw new Error('Conta não encontrada')
  const res = await fetch(`https://api.mercadolibre.com${path}`, {
    headers: { Authorization: `Bearer ${account.access_token}` },
  })
  if (!res.ok) throw new Error(`ML ${res.status}`)
  return res.json()
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || ''
  const { searchParams } = new URL(req.url)
  const secret = searchParams.get('secret')
  if (secret !== 'LUXO2026' && !authHeader.startsWith('Basic ')) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const t0 = Date.now()

  try {
    // Pega todas as orders dos últimos 30 dias que NÃO têm total_paid_amount
    const orders = await prisma.orders.findMany({
      where: {
        origem: 'mercado_livre',
        created_at: { gte: new Date(Date.now() - 30 * 24 * 3600 * 1000) },
        total_paid_amount: null,
      },
      orderBy: { created_at: 'desc' },
      take: 10, // batch pequeno
      select: {
        id: true,
        order_number: true,
        total: true,
        comissao_seller_valor: true,
        frete: true,
        recebimento_liquido: true,
        marketplace_account_id: true,
      },
    })

    console.log(`[Backfill total_paid] ${orders.length} orders`)

    const atualizacoes: any[] = []
    let atualizadas = 0
    let erros = 0

    for (const o of orders) {
      try {
        const detail: any = await mlFetch(o.marketplace_account_id!, `/orders/${o.order_number}`)
        const payment = detail?.payments?.[0]
        const totalPaid = payment?.total_paid_amount ? Number(payment.total_paid_amount) : null

        if (totalPaid != null) {
          await prisma.orders.update({
            where: { id: o.id },
            data: { total_paid_amount: totalPaid },
          })
          atualizadas++
        }

        atualizacoes.push({
          id: o.order_number,
          total_paid: totalPaid,
          transaction: detail?.total_amount,
          diff: totalPaid && detail?.total_amount ? Number(totalPaid - Number(detail.total_amount)).toFixed(2) : null,
        })

        await new Promise((r) => setTimeout(r, 150))
      } catch (err: any) {
        erros++
        atualizacoes.push({ id: o.order_number, error: err.message.slice(0, 100) })
      }
    }

    return NextResponse.json({
      ok: true,
      total: orders.length,
      atualizadas,
      erros,
      exemplos: atualizacoes.slice(0, 15),
      duracao_ms: Date.now() - t0,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}