/**
 * Migration BATCH: remove prefixo "ML-" dos SKUs via SQL direto
 * Single UPDATE statement (muito mais rápido que loop Prisma)
 *
 * GET /api/admin/strip-ml-prefix-products-batch?secret=LUXO2026
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || ''
  const { searchParams } = new URL(req.url)
  const secret = searchParams.get('secret')
  if (secret !== 'LUXO2026' && !authHeader.startsWith('Basic ')) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const t0 = Date.now()

  try {
    // Conta quantos serão atualizados
    const antes = await prisma.$queryRawUnsafe<any[]>(
      `SELECT COUNT(*) as total FROM products WHERE sku LIKE 'ML-%'`
    )
    const total = Number(antes[0]?.total || 0)

    if (total === 0) {
      return NextResponse.json({ ok: true, mensagem: 'Nada para atualizar', total: 0 })
    }

    // UPDATE direto — SUBSTRING remove os primeiros 3 chars ("ML-")
    // WHERE garante que só pega os que começam com "ML-" e têm pelo menos 4 chars
    const result = await prisma.$executeRawUnsafe(
      `UPDATE products SET sku = SUBSTRING(sku FROM 4) WHERE sku LIKE 'ML-%' AND LENGTH(sku) > 3`
    )

    // Conta quantos sobraram (deve ser 0)
    const depois = await prisma.$queryRawUnsafe<any[]>(
      `SELECT COUNT(*) as total FROM products WHERE sku LIKE 'ML-%'`
    )
    const sobraram = Number(depois[0]?.total || 0)

    return NextResponse.json({
      ok: true,
      atualizados: result,
      total_antes: total,
      total_depois_com_prefixo: sobraram,
      duracao_ms: Date.now() - t0,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}