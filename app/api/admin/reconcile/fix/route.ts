import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// POST /api/admin/reconcile/fix  body: { results: [{order_id, ml_receb}] }
// ou { id: 'recon-id' } para fixar 1
// Marca como resolved no DB e atualiza orders.recebimento_liquido

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const fixes: { reconId?: string; orderId?: string; mlReceb: number }[] = []

    if (body.id && body.ml_receb != null) {
      const recon = await prisma.$queryRawUnsafe<any[]>(
        `SELECT id, order_id, ml_receb, pack_id FROM reconciliation_results WHERE id = $1`,
        body.id,
      )
      if (recon.length === 0) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
      fixes.push({
        reconId: recon[0].id,
        orderId: recon[0].order_id,
        mlReceb: Number(body.ml_receb),
      })
    } else if (Array.isArray(body.results)) {
      for (const r of body.results) {
        if (r.ml_receb != null && r.order_id) {
          fixes.push({ reconId: r.id, orderId: r.order_id, mlReceb: Number(r.ml_receb) })
        }
      }
    } else {
      return NextResponse.json({ ok: false, error: 'id or results required' }, { status: 400 })
    }

    const updates: any[] = []
    for (const f of fixes) {
      // atualiza orders.recebimento_liquido
      await prisma.$executeRawUnsafe(
        `UPDATE orders SET recebimento_liquido = $1 WHERE id = $2`,
        f.mlReceb,
        f.orderId,
      )
      // marca reconciliation como resolved
      if (f.reconId) {
        await prisma.$executeRawUnsafe(
          `UPDATE reconciliation_results SET status = 'fixed', resolved_at = NOW(), resolved_receb = $1 WHERE id = $2`,
          f.mlReceb,
          f.reconId,
        )
      }
      updates.push({ reconId: f.reconId, orderId: f.orderId, new_receb: f.mlReceb })
    }

    return NextResponse.json({ ok: true, updated: updates.length, updates })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}