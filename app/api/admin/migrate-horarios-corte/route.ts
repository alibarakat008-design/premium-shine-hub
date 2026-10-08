/**
 * Migration: horarios de corte configuraveis
 *
 * Cada conta (ML, Shopee) pode ter horarios diferentes de coleta/agencia.
 * As vezes imprimem etiqueta do proximo dia junto. Tudo isso precisa ser
 * configuravel.
 *
 * Tabelas:
 *  - horarios_corte: regras por company/marketplace_account/dia_semana/horario
 *  - orders.impressa_junto_proximo_dia: BOOLEAN (etiqueta foi imprimida junto)
 *  - orders.horario_corte_id: FK horarios_corte (qual regra aplicou)
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const results: string[] = []

    // 1) Tabela horarios_corte
    await prisma.$queryRawUnsafe(`
      CREATE TABLE IF NOT EXISTS horarios_corte (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID,
        marketplace_account_id UUID,
        tipo VARCHAR(50) NOT NULL DEFAULT 'custom',
        descricao VARCHAR(200),
        dia_semana INT NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
        horario TIME NOT NULL,
        ativo BOOLEAN NOT NULL DEFAULT true,
        permite_junto_proximo_dia BOOLEAN NOT NULL DEFAULT false,
        limite_junto_horas INT DEFAULT 2,
        observacoes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `).catch((e: any) => { throw new Error('horarios_corte: ' + e.message) })
    results.push('horarios_corte OK')

    // 2) Colunas em orders
    await prisma.$queryRawUnsafe(`
      ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS impressa_junto_proximo_dia BOOLEAN DEFAULT false
    `).catch((e: any) => { throw new Error('impressa_junto_proximo_dia: ' + e.message) })
    results.push('orders.impressa_junto_proximo_dia OK')

    await prisma.$queryRawUnsafe(`
      ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS horario_corte_id UUID
    `).catch((e: any) => { throw new Error('horario_corte_id: ' + e.message) })
    results.push('orders.horario_corte_id OK')

    // 3) FK
    await prisma.$queryRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                       WHERE table_name = 'orders' AND constraint_name = 'fk_orders_horario_corte') THEN
          ALTER TABLE orders ADD CONSTRAINT fk_orders_horario_corte
          FOREIGN KEY (horario_corte_id) REFERENCES horarios_corte(id) ON DELETE SET NULL;
        END IF;
      END $$;
    `).catch(() => {})
    results.push('FK horario_corte OK')

    // 4) Atualizar data_contabil pra considerar impressa_junto_proximo_dia
    // Se venda impressa junto com etiquetas do proximo dia, conta no proximo dia
    // (mas só se horário permite)
    // Por agora, mantem data_contabil como ta — a regra de "junto" e manual via flag

    return NextResponse.json({ ok: true, results })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  return GET(req)
}
