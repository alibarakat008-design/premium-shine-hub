import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

/**
 * GET /api/admin/migrate-purchases
 * Migration: adiciona campos NF em supplier_purchases
 * Idempotente — só roda se as colunas não existirem
 * Secret: LUXO2026
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  if (searchParams.get('secret') !== 'LUXO2026') {
    return NextResponse.json({ ok: false, error: 'secret=LUXO2026' }, { status: 400 })
  }

  const authHeader = req.headers.get('authorization') || ''
  if (!authHeader.startsWith('Basic ')) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const results: any = {}

    // 1) Adiciona colunas (IF NOT EXISTS)
    const cols = [
      ['numero_nota_fiscal', 'VARCHAR(50)'],
      ['chave_acesso_nf', 'VARCHAR(60)'],
      ['observacoes', 'TEXT'],
      ['xml_url', 'TEXT'],
      ['updated_at', 'TIMESTAMP'],
    ]
    for (const [name, type] of cols) {
      try {
        await prisma.$queryRawUnsafe(`ALTER TABLE supplier_purchases ADD COLUMN IF NOT EXISTS ${name} ${type}`)
        results[name] = 'OK'
      } catch (e: any) {
        results[name] = `ERR: ${e.message.substring(0, 100)}`
      }
    }

    // 2) Trigger updated_at
    try {
      await prisma.$queryRawUnsafe(`
        CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
        BEGIN
          NEW.updated_at = NOW();
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
      `)
      await prisma.$queryRawUnsafe(`DROP TRIGGER IF EXISTS trg_supplier_purchases_updated ON supplier_purchases`)
      await prisma.$queryRawUnsafe(`
        CREATE TRIGGER trg_supplier_purchases_updated BEFORE UPDATE ON supplier_purchases
        FOR EACH ROW EXECUTE FUNCTION set_updated_at()
      `)
      results.trigger = 'OK'
    } catch (e: any) {
      results.trigger = `ERR: ${e.message.substring(0, 100)}`
    }

    // 3) Confirma colunas finais
    const colsFinal: any = await prisma.$queryRawUnsafe(`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_name = 'supplier_purchases' ORDER BY ordinal_position
    `)
    results.final_columns = colsFinal

    return NextResponse.json({ ok: true, results })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}