import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    // Cria tabela reconciliation_results (idempotente)
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS reconciliation_results (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        order_id uuid NOT NULL,
        order_number varchar(50),
        pack_id varchar(50),
        tipo_envio varchar(30),
        ml_receb numeric(10,2),
        db_receb numeric(10,2),
        diff numeric(10,2),
        ml_sale_fee numeric(10,2),
        ml_receiver_save numeric(10,2),
        ml_sender_save numeric(10,2),
        ml_sender_cost numeric(10,2),
        ml_venda numeric(10,2),
        status varchar(20) DEFAULT 'pending',
        observed_at timestamp DEFAULT now(),
        resolved_at timestamp,
        resolved_receb numeric(10,2)
      );
    `)
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_recon_status ON reconciliation_results(status);
    `)
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_recon_pack ON reconciliation_results(pack_id);
    `)
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_recon_observed ON reconciliation_results(observed_at DESC);
    `)

    return NextResponse.json({ ok: true, message: 'tabela reconciliation_results criada (ou já existia)' })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}