/**
 * POST /api/admin/delete-ml-account?account_id=X&confirm=yes
 *
 * Deleta uma marketplace_accounts (conta ML) do sistema.
 * Também deleta orders e items vinculados (cascade manual).
 *
 * ⚠️ IRREVERSÍVEL — só roda se confirm=yes na query string.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const accountId = searchParams.get('account_id')
    const confirm = searchParams.get('confirm')

    if (!accountId) {
      return NextResponse.json({ ok: false, error: 'account_id obrigatório' }, { status: 400 })
    }
    if (confirm !== 'yes') {
      return NextResponse.json({
        ok: false,
        error: 'Adicione ?confirm=yes na URL pra confirmar a operação (IRREVERSÍVEL)',
      }, { status: 400 })
    }

    // Conta o que vai ser removido
    const account: any = await prisma.marketplace_accounts.findUnique({
      where: { id: accountId },
      select: { id: true, nickname: true, account_id: true, company_id: true },
    })
    if (!account) {
      return NextResponse.json({ ok: false, error: 'Conta não encontrada' }, { status: 404 })
    }

    const ordersCount: any[] = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS total FROM orders WHERE marketplace_account_id = $1::uuid`,
      accountId,
    )

    // Cascade: deleta items primeiro, depois orders, depois a conta
    await prisma.$executeRawUnsafe(`
      DELETE FROM order_items
      WHERE order_id IN (SELECT id FROM orders WHERE marketplace_account_id = $1::uuid)
    `, accountId)
    await prisma.$executeRawUnsafe(
      `DELETE FROM orders WHERE marketplace_account_id = $1::uuid`,
      accountId,
    )
    await prisma.marketplace_accounts.delete({
      where: { id: accountId },
    })

    return NextResponse.json({
      ok: true,
      message: `Conta ML "${account.nickname}" (${account.account_id}) removida. ${ordersCount[0]?.total || 0} orders + items deletados.`,
      conta_removida: account,
      orders_removidas: ordersCount[0]?.total || 0,
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}