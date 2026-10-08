import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  // Auth Basic
  const auth = req.headers.get('authorization')
  if (auth !== `Basic ${Buffer.from('premium:shine2026').toString('base64')}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // 1. Adicionar coluna account_type
    try {
      await prisma.$queryRawUnsafe(`
        ALTER TABLE companies
          ADD COLUMN IF NOT EXISTS account_type VARCHAR(20) DEFAULT 'matriz'
      `)
    } catch (e: any) {
      return NextResponse.json({ ok: false, step: 'add_column', error: e.message }, { status: 500 })
    }

    // 2. Garantir LIURAESSENCE = matriz
    await prisma.$queryRawUnsafe(`
      INSERT INTO companies (cnpj, razao_social, nome_fantasia, account_type, ativa)
      VALUES ('11.222.333/0001-81', 'LIURA ESSENCE COMERCIO DE PERFUMES LTDA', 'LIURA ESSENCE', 'matriz', true)
      ON CONFLICT (cnpj) DO UPDATE SET account_type = 'matriz', updated_at = NOW()
    `)

    // 3. Vincular orders existentes à LIURAESSENCE (matriz oficial)
    await prisma.$queryRawUnsafe(`
      UPDATE orders SET company_id = (SELECT id FROM companies WHERE cnpj = '11.222.333/0001-81')
      WHERE company_id IS NULL
    `)

    // 3b. Mover todas as vendas que estão em outras companies para LIURAESSENCE
    await prisma.$queryRawUnsafe(`
      UPDATE orders SET company_id = (SELECT id FROM companies WHERE cnpj = '11.222.333/0001-81')
      WHERE company_id IN (SELECT id FROM companies WHERE cnpj != '11.222.333/0001-81')
    `)

    // 3c. Mover product_prices, marketplace_accounts, cashflow, invoices também
    await prisma.$queryRawUnsafe(`
      UPDATE product_prices SET company_id = (SELECT id FROM companies WHERE cnpj = '11.222.333/0001-81')
      WHERE company_id IN (SELECT id FROM companies WHERE cnpj != '11.222.333/0001-81')
    `)
    await prisma.$queryRawUnsafe(`
      UPDATE marketplace_accounts SET company_id = (SELECT id FROM companies WHERE cnpj = '11.222.333/0001-81')
      WHERE company_id IN (SELECT id FROM companies WHERE cnpj != '11.222.333/0001-81')
    `)
    await prisma.$queryRawUnsafe(`
      UPDATE cashflow SET company_id = (SELECT id FROM companies WHERE cnpj = '11.222.333/0001-81')
      WHERE company_id IN (SELECT id FROM companies WHERE cnpj != '11.222.333/0001-81')
    `)
    await prisma.$queryRawUnsafe(`
      UPDATE invoices SET company_id = (SELECT id FROM companies WHERE cnpj = '11.222.333/0001-81')
      WHERE company_id IN (SELECT id FROM companies WHERE cnpj != '11.222.333/0001-81')
    `)

    // 3d. Marcar as outras como PARCEIRO (pra ficarem visíveis no seletor)
    await prisma.$queryRawUnsafe(`
      UPDATE companies SET account_type = 'parceiro'
      WHERE cnpj != '11.222.333/0001-81' AND account_type = 'matriz'
    `)

    // 3e. Reverter reatribuições erradas — vendas devem ficar com a matriz LIURAESSENCE
    // (vendas criadas/reatribuídas via /api/admin/importar-vendas-parceiro que eram da LIURAESSENCE)
    // A lógica correta: cada venda pertence à matriz LIURAESSENCE, exceto se explicitamente cadastrada
    // por outra empresa via fluxo legítimo. Por enquanto, mantemos TUDO na matriz.
    await prisma.$queryRawUnsafe(`
      UPDATE orders SET company_id = (SELECT id FROM companies WHERE cnpj = '11.222.333/0001-81')
      WHERE company_id IN (SELECT id FROM companies WHERE cnpj != '11.222.333/0001-81')
    `)
    await prisma.$queryRawUnsafe(`
      UPDATE order_items oi SET custo_unitario = 0
      WHERE oi.order_id IN (
        SELECT id FROM orders WHERE company_id IN (SELECT id FROM companies WHERE cnpj != '11.222.333/0001-81')
      )
    `)

    // 4. Listar companies + métricas
    const companies: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        c.id,
        c.cnpj,
        c.nome_fantasia,
        c.razao_social,
        c.account_type,
        c.ativa,
        (SELECT COUNT(*)::int FROM orders o WHERE o.company_id = c.id) AS total_orders,
        (SELECT COUNT(DISTINCT pp.product_id)::int FROM product_prices pp WHERE pp.company_id = c.id) AS total_products,
        (SELECT COUNT(*)::int FROM marketplace_accounts ma WHERE ma.company_id = c.id) AS total_accounts_ml
      FROM companies c
      ORDER BY c.account_type, c.nome_fantasia
    `)

    return NextResponse.json({
      ok: true,
      message: 'Multi-company migration aplicada',
      companies,
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}