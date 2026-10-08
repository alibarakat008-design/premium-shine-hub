import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const status = url.searchParams.get('status') || 'pending'
    const tipo = url.searchParams.get('tipo') || null
    const limit = Number(url.searchParams.get('limit')) || 100
    const onlyDiscrepancy = url.searchParams.get('discrepancy') === '1'

    const where: any = {}
    if (status !== 'all') where.status = status
    if (tipo) where.tipo_envio = tipo

    let sql = `SELECT id, order_id, order_number, pack_id, tipo_envio, ml_receb, db_receb, diff, ml_sale_fee, ml_receiver_save, ml_sender_save, ml_sender_cost, ml_venda, status, observed_at, resolved_at, resolved_receb
              FROM reconciliation_results
              WHERE 1=1 `
    const params: any[] = []
    let idx = 1
    if (status !== 'all') { sql += ` AND status = $${idx}`; params.push(status); idx++ }
    if (tipo) { sql += ` AND tipo_envio = $${idx}`; params.push(tipo); idx++ }
    if (onlyDiscrepancy) sql += ` AND ABS(diff) > 0.5 `
    sql += ` ORDER BY ABS(diff) DESC, observed_at DESC LIMIT ${limit}`

    const rows = await prisma.$queryRawUnsafe<any[]>(sql, ...params)

    // stats
    const stats = await prisma.$queryRawUnsafe<any[]>(
      `SELECT
        status,
        tipo_envio,
        COUNT(*)::int as total,
        SUM(ABS(diff))::numeric as total_abs_diff,
        AVG(ABS(diff))::numeric as avg_abs_diff
       FROM reconciliation_results
       WHERE status = 'pending'
       GROUP BY status, tipo_envio`
    )

    return NextResponse.json({
      ok: true,
      total: rows.length,
      results: rows.map(r => ({
        ...r,
        ml_receb: r.ml_receb ? Number(r.ml_receb) : null,
        db_receb: r.db_receb ? Number(r.db_receb) : null,
        diff: r.diff ? Number(r.diff) : null,
        ml_sale_fee: r.ml_sale_fee ? Number(r.ml_sale_fee) : null,
        ml_receiver_save: r.ml_receiver_save ? Number(r.ml_receiver_save) : null,
        ml_sender_save: r.ml_sender_save ? Number(r.ml_sender_save) : null,
        ml_sender_cost: r.ml_sender_cost ? Number(r.ml_sender_cost) : null,
        ml_venda: r.ml_venda ? Number(r.ml_venda) : null,
        resolved_receb: r.resolved_receb ? Number(r.resolved_receb) : null,
      })),
      stats,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}