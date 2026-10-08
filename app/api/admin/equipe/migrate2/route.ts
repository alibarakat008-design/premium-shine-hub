/**
 * POST /api/admin/equipe/migrate2
 * Adiciona tabela equipe_pagamentos
 */
import { NextRequest, NextResponse } from 'next/server'
import { isMatrizRequest } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  if (!isMatrizRequest(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  
  try {
    // 1. Criar enum (primeiro!)
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        CREATE TYPE pagamento_tipo AS ENUM ('salario', 'vale', 'bonus', 'decimo_terceiro', 'ferias', 'outro');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `)

    // 2. Tabela
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS equipe_pagamentos (
        id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
        equipe_id UUID NOT NULL REFERENCES equipe(id) ON DELETE CASCADE,
        tipo pagamento_tipo NOT NULL DEFAULT 'vale',
        valor DECIMAL(10,2) NOT NULL DEFAULT 0,
        data_pagamento DATE NOT NULL,
        referencia_mes INT,
        referencia_ano INT,
        observacao TEXT,
        registrado_por VARCHAR(255),
        company_id UUID,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      );
    `)

    // 3. Índices
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_equipe_pagamentos_equipe ON equipe_pagamentos(equipe_id);`)
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_equipe_pagamentos_data ON equipe_pagamentos(data_pagamento);`)

    return NextResponse.json({ ok: true, message: 'Tabela pagamentos criada!' })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}
