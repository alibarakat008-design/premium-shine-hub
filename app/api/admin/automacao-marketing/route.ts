// GET/POST/DELETE/PATCH /api/admin/automacao-marketing
// CRUD de regras de automação de marketing
// Gatilhos: cliente_sumido, alta_compra, abandono_carrinho, aniversario, recompra_prevista, etc
// Ações: whatsapp_template, cupom, email, tag_customers
// Execução: manual ou via cron

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    // Listar regras existentes
    const rules = await prisma.$queryRawUnsafe<any[]>(`
      SELECT * FROM marketing_rules 
      ORDER BY created_at DESC
      LIMIT 100
    `).catch(() => [])

    // Listar execuções recentes
    const executions = await prisma.$queryRawUnsafe<any[]>(`
      SELECT * FROM marketing_executions 
      ORDER BY executed_at DESC
      LIMIT 50
    `).catch(() => [])

    return NextResponse.json({
      ok: true,
      regras: rules || [],
      execucoes: executions || [],
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message, stack: err.stack }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { nome, gatilho, acao, template, cupom_pct, segmento, ativo } = body

    if (!nome || !gatilho || !acao) {
      return NextResponse.json({ ok: false, error: 'nome, gatilho e acao são obrigatórios' }, { status: 400 })
    }

    // Cria tabela se não existir (Postgres não tem IF NOT EXISTS, então usa try/catch)
    try {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS marketing_rules (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          nome VARCHAR(255) NOT NULL,
          gatilho VARCHAR(50) NOT NULL,
          acao VARCHAR(50) NOT NULL,
          template TEXT,
          cupom_pct INT DEFAULT 0,
          segmento VARCHAR(50) DEFAULT 'todos',
          ativo BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `)
    } catch { /* pode já existir */ }

    try {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS marketing_executions (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          rule_id UUID,
          clientes_atingidos INT DEFAULT 0,
          mensagens_enviadas INT DEFAULT 0,
          status VARCHAR(20) DEFAULT 'pendente',
          executed_at TIMESTAMP DEFAULT NOW(),
          error TEXT
        )
      `)
    } catch { /* pode já existir */ }

    const id = await prisma.$queryRawUnsafe<any[]>(`
      INSERT INTO marketing_rules (nome, gatilho, acao, template, cupom_pct, segmento, ativo)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `, nome, gatilho, acao, template || null, cupom_pct || 0, segmento || 'todos', ativo !== false)

    return NextResponse.json({ ok: true, id: id[0]?.id })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message, stack: err.stack }, { status: 500 })
  }
}
