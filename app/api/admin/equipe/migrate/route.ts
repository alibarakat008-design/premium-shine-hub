/**
 * POST /api/admin/equipe/migrate
 * Executa criação das tabelas equipe, equipe_ponto, equipe_salarios
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
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        CREATE TYPE ponto_tipo AS ENUM ('entrada', 'saida', 'pausa');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `)

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS equipe (
        id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
        nome VARCHAR(255) NOT NULL,
        cargo VARCHAR(100),
        foto_url VARCHAR(500),
        telefone VARCHAR(30),
        email VARCHAR(255),
        data_nascimento DATE,
        data_admissao DATE,
        salario_base DECIMAL(10,2) DEFAULT 0,
        ativo BOOLEAN DEFAULT true,
        observacao TEXT,
        company_id UUID,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      );
    `)

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS equipe_ponto (
        id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
        equipe_id UUID NOT NULL REFERENCES equipe(id) ON DELETE CASCADE,
        tipo ponto_tipo DEFAULT 'entrada',
        data_hora TIMESTAMPTZ NOT NULL,
        foto_url VARCHAR(500),
        observacao TEXT,
        registrado_por VARCHAR(255),
        company_id UUID,
        created_at TIMESTAMPTZ DEFAULT now()
      );
    `)

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS equipe_salarios (
        id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
        equipe_id UUID NOT NULL REFERENCES equipe(id) ON DELETE CASCADE,
        mes INT NOT NULL CHECK (mes BETWEEN 1 AND 12),
        ano INT NOT NULL,
        salario_base DECIMAL(10,2) DEFAULT 0,
        bonificacao DECIMAL(10,2) DEFAULT 0,
        descontos DECIMAL(10,2) DEFAULT 0,
        salario_liquido DECIMAL(10,2) DEFAULT 0,
        observacao TEXT,
        pago_em DATE,
        pago BOOLEAN DEFAULT false,
        company_id UUID,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now(),
        UNIQUE(equipe_id, mes, ano)
      );
    `)

    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_equipe_company ON equipe(company_id);`)
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_equipe_ativo ON equipe(ativo);`)
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_equipe_ponto_equipe ON equipe_ponto(equipe_id);`)
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_equipe_ponto_data ON equipe_ponto(data_hora);`)
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_equipe_salarios_equipe ON equipe_salarios(equipe_id);`)

    return NextResponse.json({ ok: true, message: 'Tabelas criadas com sucesso!' })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}
