import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * GET /api/public/get-ml-company?company_id=X
 *
 * PÚBLICO (sem auth) — retorna nome + cnpj da empresa.
 * Usado pela página /vincular-ml pra mostrar pro vendor qual empresa tá sendo vinculada.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const companyId = searchParams.get('company_id')
  if (!companyId) {
    return NextResponse.json({ ok: false, error: 'company_id obrigatório' }, { status: 400 })
  }
  try {
    const r: any = await prisma.$queryRawUnsafe(
      `SELECT id, nome_fantasia, cnpj FROM companies WHERE id = $1::uuid`,
      companyId,
    )
    if (r.length === 0) {
      return NextResponse.json({ ok: false, error: 'Empresa não encontrada' }, { status: 404 })
    }
    return NextResponse.json({ ok: true, company: r[0] })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message?.substring(0, 200) }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}