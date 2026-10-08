import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// POST /api/admin/reconcile/ignore  body: { id: 'recon-id' } ou { results: [...] }
// Marca como 'ignored' (não faz fix)

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const ids: string[] = []
    if (body.id) ids.push(body.id)
    if (Array.isArray(body.ids)) ids.push(...body.ids)
    if (ids.length === 0) return NextResponse.json({ ok: false, error: 'id or ids required' }, { status: 400 })

    const updated = await prisma.$executeRawUnsafe(
      `UPDATE reconciliation_results SET status = 'ignored', resolved_at = NOW() WHERE id = ANY($1::uuid[])`,
      ids,
    )

    return NextResponse.json({ ok: true, ignored: updated, ids })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}