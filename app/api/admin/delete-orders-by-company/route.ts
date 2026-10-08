/**
 * POST /api/admin/delete-orders-by-company?company_id=X&confirm=yes
 *
 * Deleta TODAS as orders (e seus items) de uma empresa.
 *
 * ⚠️ IRREVERSÍVEL — só roda se confirm=yes na query string.
 *
 * Use pra limpar vendas importadas por engano (ex: OAuth com conta ML errada).
 */
import { NextRequest, NextResponse } from 'next/server'
import { isMatrizRequest } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// REVISADO (24/07/2026): esta rota deleta dados de forma irreversível e
// antes não tinha nenhuma checagem própria — dependia só do middleware
// global, então qualquer sessão autenticada (inclusive parceiro) poderia
// chamá-la. Agora é exclusiva da matriz.
export async function POST(req: NextRequest) {
  if (!isMatrizRequest(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized — ação restrita à matriz' }, { status: 401 })
  }
  try {
    const { searchParams } = new URL(req.url)
    const companyId = searchParams.get('company_id')
    const confirm = searchParams.get('confirm')

    if (!companyId) {
      return NextResponse.json({ ok: false, error: 'company_id obrigatório' }, { status: 400 })
    }
    if (confirm !== 'yes') {
      return NextResponse.json({
        ok: false,
        error: 'Adicione ?confirm=yes na URL pra confirmar a operação (IRREVERSÍVEL)',
      }, { status: 400 })
    }

    // Conta quantos items vão sumir
    const itemsCount: any[] = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*)::int AS total
      FROM order_items oi
      INNER JOIN orders o ON o.id = oi.order_id
      WHERE o.company_id = $1::uuid
    `, companyId)

    const ordersCount: any[] = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS total FROM orders WHERE company_id = $1::uuid`,
      companyId,
    )

    // Deleta items primeiro (FK)
    await prisma.$executeRawUnsafe(`
      DELETE FROM order_items
      WHERE order_id IN (SELECT id FROM orders WHERE company_id = $1::uuid)
    `, companyId)

    // Deleta orders
    await prisma.$executeRawUnsafe(
      `DELETE FROM orders WHERE company_id = $1::uuid`,
      companyId,
    )

    // Pega nome da empresa
    const company: any[] = await prisma.$queryRawUnsafe(
      `SELECT nome_fantasia FROM companies WHERE id = $1::uuid`,
      companyId,
    )

    return NextResponse.json({
      ok: true,
      message: `Removidos ${ordersCount[0]?.total || 0} orders e ${itemsCount[0]?.total || 0} items de ${company[0]?.nome_fantasia || companyId}`,
      orders_removidas: ordersCount[0]?.total || 0,
      items_removidos: itemsCount[0]?.total || 0,
      company: company[0],
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}