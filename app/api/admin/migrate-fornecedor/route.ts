/**
 * Migration: adiciona custo_fornecedor em product_prices
 * + cria tabela product_suppliers (relação produto-fornecedor)
 * + cria tabela supplier_products (catálogo de produtos que LIURA vende pros parceiros)
 *
 * Idempotente.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const results: string[] = []

    // 1) Custo fornecedor (o que LIURA paga pra adquirir)
    const col1 = await prisma.$queryRawUnsafe(`
      ALTER TABLE product_prices
      ADD COLUMN IF NOT EXISTS custo_fornecedor NUMERIC(10,2) DEFAULT 0
    `).catch((e: any) => { throw new Error('custo_fornecedor: ' + e.message) })
    results.push('product_prices.custo_fornecedor OK')

    // 2) Fornecedor preferencial (FK pra companies - "compro de")
    const col2 = await prisma.$queryRawUnsafe(`
      ALTER TABLE product_prices
      ADD COLUMN IF NOT EXISTS fornecedor_company_id UUID
    `).catch((e: any) => { throw new Error('fornecedor_company_id: ' + e.message) })
    results.push('product_prices.fornecedor_company_id OK')

    // 3) É próprio (não compra de ninguém)
    const col3 = await prisma.$queryRawUnsafe(`
      ALTER TABLE product_prices
      ADD COLUMN IF NOT EXISTS is_proprio BOOLEAN DEFAULT false
    `).catch((e: any) => { throw new Error('is_proprio: ' + e.message) })
    results.push('product_prices.is_proprio OK')

    // 4) Estoque atual (pra controlar compras)
    const col4 = await prisma.$queryRawUnsafe(`
      ALTER TABLE product_prices
      ADD COLUMN IF NOT EXISTS estoque_atual INTEGER DEFAULT 0
    `).catch((e: any) => { throw new Error('estoque_atual: ' + e.message) })
    results.push('product_prices.estoque_atual OK')

    // 5) Estoque mínimo (alerta de recompra)
    const col5 = await prisma.$queryRawUnsafe(`
      ALTER TABLE product_prices
      ADD COLUMN IF NOT EXISTS estoque_minimo INTEGER DEFAULT 0
    `).catch((e: any) => { throw new Error('estoque_minimo: ' + e.message) })
    results.push('product_prices.estoque_minimo OK')

    // 6) Tabela de COMPRAS (entrada de mercadoria do fornecedor pra empresa)
    await prisma.$queryRawUnsafe(`
      CREATE TABLE IF NOT EXISTS company_purchases (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL,
        fornecedor_company_id UUID,
        numero_pedido VARCHAR(100),
        data_compra TIMESTAMPTZ DEFAULT NOW(),
        data_recebimento TIMESTAMPTZ,
        total NUMERIC(12,2) DEFAULT 0,
        status VARCHAR(50) DEFAULT 'pendente',
        observacoes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `).catch((e: any) => { throw new Error('company_purchases: ' + e.message) })
    results.push('company_purchases OK')

    await prisma.$queryRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_company_purchases_company
      ON company_purchases(company_id, data_compra DESC)
    `).catch(() => {})
    results.push('idx_company_purchases OK')

    // 7) Items da compra
    await prisma.$queryRawUnsafe(`
      CREATE TABLE IF NOT EXISTS company_purchase_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        purchase_id UUID NOT NULL,
        product_id UUID,
        sku VARCHAR(100),
        nome_produto VARCHAR(500),
        quantidade INTEGER NOT NULL DEFAULT 1,
        custo_unitario NUMERIC(10,2) DEFAULT 0,
        custo_total NUMERIC(12,2) DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `).catch((e: any) => { throw new Error('company_purchase_items: ' + e.message) })
    results.push('company_purchase_items OK')

    // 8) Tabela de VENDAS entre empresas (parceiro compra do LIURA)
    await prisma.$queryRawUnsafe(`
      CREATE TABLE IF NOT EXISTS inter_company_sales (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        seller_company_id UUID NOT NULL,
        buyer_company_id UUID NOT NULL,
        order_id UUID,
        data_venda TIMESTAMPTZ DEFAULT NOW(),
        total NUMERIC(12,2) DEFAULT 0,
        custo_vendedor NUMERIC(12,2) DEFAULT 0,
        lucro_vendedor NUMERIC(12,2) DEFAULT 0,
        observacoes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `).catch((e: any) => { throw new Error('inter_company_sales: ' + e.message) })
    results.push('inter_company_sales OK')

    await prisma.$queryRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_inter_company_sales_seller
      ON inter_company_sales(seller_company_id, data_venda DESC)
    `).catch(() => {})
    await prisma.$queryRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_inter_company_sales_buyer
      ON inter_company_sales(buyer_company_id, data_venda DESC)
    `).catch(() => {})
    results.push('idx_inter_company_sales OK')

    // 9) Trigger updated_at
    await prisma.$queryRawUnsafe(`
      CREATE OR REPLACE FUNCTION trigger_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `).catch(() => {})
    await prisma.$queryRawUnsafe(`
      DROP TRIGGER IF EXISTS trg_company_purchases_updated ON company_purchases
    `).catch(() => {})
    await prisma.$queryRawUnsafe(`
      CREATE TRIGGER trg_company_purchases_updated
      BEFORE UPDATE ON company_purchases
      FOR EACH ROW EXECUTE FUNCTION trigger_updated_at()
    `).catch(() => {})
    results.push('triggers OK')

    return NextResponse.json({ ok: true, results })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  return GET(req)
}
