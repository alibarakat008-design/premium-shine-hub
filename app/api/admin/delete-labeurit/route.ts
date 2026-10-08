/**
 * DELETE-LABEURIT: deleta toda a empresa LABEIRUT (conta fechada)
 *
 * Remove em cascata:
 * - company
 * - users da company
 * - marketplace_accounts + tokens ML
 * - orders + order_items
 * - product_prices, products da company
 * - outras tabelas com FK company_id
 *
 * GET /api/admin/delete-labeurit?secret=LUXO2026&confirm=DELETE_EVERYTHING
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

const BASIC = 'Basic ' + Buffer.from('premium:shine2026').toString('base64')
const LABEIRUT = '57d6d2a8-518e-4585-b9bb-cb474ab8ea83'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const secret = req.nextUrl.searchParams.get('secret')
  const confirm = req.nextUrl.searchParams.get('confirm')

  if (auth !== BASIC && secret !== 'LUXO2026') {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const companyId = req.nextUrl.searchParams.get('company_id') || LABEIRUT

  try {
    // 1) Contar antes de deletar
    const counts = await prisma.$queryRawUnsafe<any[]>(`
      SELECT
        (SELECT COUNT(*)::int FROM orders WHERE company_id = $1::uuid) as orders,
        (SELECT COUNT(*)::int FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.company_id = $1::uuid) as order_items,
        (SELECT COUNT(*)::int FROM product_prices WHERE company_id = $1::uuid) as product_prices,
        (SELECT COUNT(*)::int FROM marketplace_accounts WHERE company_id = $1::uuid) as ml_accounts,
        (SELECT COUNT(*)::int FROM users WHERE company_id = $1::uuid) as users,
        (SELECT COUNT(*)::int FROM products WHERE sku LIKE 'AUTO-%' AND id IN (SELECT product_id FROM product_prices WHERE company_id = $1::uuid)) as auto_products
    `, companyId)

    if (confirm !== 'DELETE_EVERYTHING') {
      return NextResponse.json({
        ok: true,
        dry_run: true,
        company_id: companyId,
        will_delete: counts[0],
        mensagem: '⚠️  Roda com ?confirm=DELETE_EVERYTHING pra deletar de verdade',
      })
    }

    const t0 = Date.now()
    const del = {
      order_items: 0,
      orders: 0,
      product_prices: 0,
      marketplace_listings: 0,
      marketplace_accounts: 0,
      auto_products: 0,
      users: 0,
      company_purchases: 0,
      company_purchase_items: 0,
      inter_company_sales: 0,
      supplier_purchases: 0,
      schedules: 0,
      company: 0,
    }

    // Order items
    const r1: any = await prisma.$executeRawUnsafe(`
      DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE company_id = $1::uuid)
    `, companyId)
    del.order_items = r1

    // Orders
    const r2: any = await prisma.$executeRawUnsafe(`
      DELETE FROM orders WHERE company_id = $1::uuid
    `, companyId)
    del.orders = r2

    // Marketplace listings
    const r3: any = await prisma.$executeRawUnsafe(`
      DELETE FROM marketplace_listings
      WHERE account_id IN (SELECT id FROM marketplace_accounts WHERE company_id = $1::uuid)
    `, companyId)
    del.marketplace_listings = r3

    // Product prices
    const r4: any = await prisma.$executeRawUnsafe(`
      DELETE FROM product_prices WHERE company_id = $1::uuid
    `, companyId)
    del.product_prices = r4

    // AUTO-* products (que eram dessa company)
    const r5: any = await prisma.$executeRawUnsafe(`
      DELETE FROM products
      WHERE sku LIKE 'AUTO-%'
        AND id NOT IN (SELECT product_id FROM product_prices WHERE company_id != $1::uuid)
        AND id NOT IN (SELECT product_id FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.company_id != $1::uuid)
    `, companyId)
    del.auto_products = r5

    // ML accounts (tokens)
    const r6: any = await prisma.$executeRawUnsafe(`
      DELETE FROM marketplace_accounts WHERE company_id = $1::uuid
    `, companyId)
    del.marketplace_accounts = r6

    // Users
    const r7: any = await prisma.$executeRawUnsafe(`
      DELETE FROM users WHERE company_id = $1::uuid
    `, companyId)
    del.users = r7

    // Company purchases
    try {
      const r8: any = await prisma.$executeRawUnsafe(`
        DELETE FROM company_purchase_items WHERE purchase_id IN (SELECT id FROM company_purchases WHERE company_id = $1::uuid)
      `, companyId)
      del.company_purchase_items = r8
    } catch {}
    try {
      const r9: any = await prisma.$executeRawUnsafe(`
        DELETE FROM company_purchases WHERE company_id = $1::uuid
      `, companyId)
      del.company_purchases = r9
    } catch {}

    // Inter-company sales
    try {
      const r10: any = await prisma.$executeRawUnsafe(`
        DELETE FROM inter_company_sales WHERE from_company_id = $1::uuid OR to_company_id = $1::uuid
      `, companyId)
      del.inter_company_sales = r10
    } catch {}

    // Supplier purchases
    try {
      const r11: any = await prisma.$executeRawUnsafe(`
        DELETE FROM supplier_purchases WHERE company_id = $1::uuid
      `, companyId)
      del.supplier_purchases = r11
    } catch {}

    // Schedules (cron jobs)
    try {
      const r12: any = await prisma.$executeRawUnsafe(`
        DELETE FROM schedules WHERE company_id = $1::uuid
      `, companyId)
      del.schedules = r12
    } catch {}

    // Company (último)
    const r13: any = await prisma.$executeRawUnsafe(`
      DELETE FROM companies WHERE id = $1::uuid
    `, companyId)
    del.company = r13

    return NextResponse.json({
      ok: true,
      company_id: companyId,
      deleted: del,
      duracao_ms: Date.now() - t0,
      mensagem: `✅ LABEIRUT removida completamente. ${del.orders} vendas + ${del.order_items} items + ${del.users} users + ${del.marketplace_accounts} contas ML deletados.`,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message, stack: err.stack?.substring(0, 500) }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}
