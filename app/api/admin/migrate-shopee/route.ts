// Adiciona colunas Shopee em companies
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    const results: string[] = []
    const cols = [
      ['shopee_access_token', 'TEXT'],
      ['shopee_refresh_token', 'TEXT'],
      ['shopee_expires_at', 'TIMESTAMPTZ'],
      ['shopee_shop_id', 'BIGINT'],
      ['shopee_partner_id', 'BIGINT'],
      ['shopee_merchant_id', 'BIGINT'],
      ['shopee_authorized_at', 'TIMESTAMPTZ'],
      ['shopee_region', "VARCHAR(10) DEFAULT 'BR'"],
    ]
    for (const [name, type] of cols) {
      try {
        await prisma.$executeRawUnsafe(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS ${name} ${type}`)
        results.push(`OK ${name}`)
      } catch (e: any) {
        results.push(`ERR ${name}: ${e.message?.substring(0, 100)}`)
      }
    }
    return NextResponse.json({ ok: true, results })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}
