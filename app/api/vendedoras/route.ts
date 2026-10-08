/**
 * =====================================================
 * MÓDULO DE VENDEDORAS
 * =====================================================
 *
 * Funcionalidades:
 *   - Cadastro com vínculo a supervisor (opcional)
 *   - Metas mensais (valor R$ ou quantidade)
 *   - Comissão configurável (% ou valor fixo por produto)
 *   - Bônus por bater meta
 *   - Ranking de vendedoras
 *   - Pagamento de comissão (manual ou automático via PIX)
 *
 * Arquivos:
 *   - app/api/vendedoras/route.ts          — CRUD de vendedoras
 *   - app/api/vendedoras/[id]/route.ts    — Detalhe/edição
 *   - app/api/vendedoras/[id]/metas.ts    — Definir metas mensais
 *   - app/api/vendedoras/[id]/comissoes.ts — Histórico de comissões
 *   - app/api/vendedoras/ranking.ts       — Top 10 do mês
 *   - app/vendedoras/page.tsx             — Dashboard da vendedora (logado)
 *   - app/admin/vendedoras/page.tsx       — Gestão admin
 * =====================================================
 */

// =====================================================
// 1) CRUD DE VENDEDORAS
// =====================================================
// app/api/vendedoras/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import bcrypt from 'bcryptjs'

export const dynamic = 'force-dynamic'

const CreateVendedoraSchema = z.object({
  nome: z.string().min(3),
  email: z.string().email(),
  telefone: z.string().min(10),
  cpf: z.string().min(11),
  password: z.string().min(6),
  // Configurações de comissão
  comissao_pct: z.number().min(0).max(100).default(10), // % padrão
  comissao_tipo: z.enum(['percentual', 'fixo_por_item']).default('percentual'),
  comissao_fixa_valor: z.number().min(0).optional().nullable(), // se tipo=fixo
  // Meta mensal
  meta_valor: z.number().min(0).default(5000),
  meta_quantidade: z.number().int().min(0).default(0),
  // Hierarquia
  supervisor_id: z.string().uuid().optional().nullable(),
  // Bônus
  bonus_meta_pct: z.number().min(0).max(100).default(5), // +5% se bater 100%
  bonus_super_meta_pct: z.number().min(0).max(100).default(10), // +10% se bater 150%
  // Outros
  pix_key: z.string().optional(),
  observacao: z.string().optional(),
})

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const ativa = searchParams.get('ativa')

  const where: any = { role: 'vendedora' }
  if (ativa !== null) where.ativo = ativa === 'true'

  const vendedoras = await prisma.users.findMany({
    where,
    select: {
      id: true,
      nome: true,
      email: true,
      telefone: true,
      cpf_cnpj: true,
      ativo: true,
      vendedora_data: true,
      last_login: true,
      created_at: true,
      _count: {
        select: {
          // Não tem relação direta, mas podemos calcular
        },
      },
    },
    orderBy: { nome: 'asc' },
  })

  // Calcular vendas do mês pra cada vendedora
  const inicioMes = new Date()
  inicioMes.setDate(1)
  inicioMes.setHours(0, 0, 0, 0)

  const resultado = await Promise.all(
    vendedoras.map(async (v) => {
      const vendas = await prisma.orders.aggregate({
        where: {
          vendedor_id: v.id,
          created_at: { gte: inicioMes },
          status: { notIn: ['cancelado'] },
        },
        _sum: { total: true, comissao_vendedora_valor: true },
        _count: true,
      })

      const data: any = v.vendedora_data || {}
      return {
        ...v,
        vendas_mes: {
          quantidade: vendas._count,
          valor: Number(vendas._sum.total || 0),
          comissao: Number(vendas._sum.comissao_vendedora_valor || 0),
        },
        meta: {
          valor: data.meta_valor || 5000,
          quantidade: data.meta_quantidade || 0,
          percentual_atingido: vendas._sum.total && data.meta_valor
            ? (Number(vendas._sum.total) / data.meta_valor) * 100
            : 0,
        },
        comissao_config: {
          tipo: data.comissao_tipo || 'percentual',
          pct: data.comissao_pct || 10,
          valor_fixo: data.comissao_fixa_valor || 0,
        },
      }
    })
  )

  return NextResponse.json({ success: true, data: resultado })
}

export async function POST(request: NextRequest) {

  try {
    const body = await request.json()
    const data = CreateVendedoraSchema.parse(body)

    // Verificar se email já existe
    const existing = await prisma.users.findUnique({ where: { email: data.email } })
    if (existing) {
      return NextResponse.json({ success: false, error: 'Email já cadastrado' }, { status: 409 })
    }

    // Hash da senha
    const passwordHash = await bcrypt.hash(data.password, 10)

    // Criar vendedora
    const vendedora = await prisma.users.create({
      data: {
        email: data.email.toLowerCase(),
        password_hash: passwordHash,
        nome: data.nome,
        telefone: data.telefone,
        cpf_cnpj: data.cpf,
        role: 'vendedora',
        vendedora_data: {
          comissao_pct: data.comissao_pct,
          comissao_tipo: data.comissao_tipo,
          comissao_fixa_valor: data.comissao_fixa_valor,
          meta_valor: data.meta_valor,
          meta_quantidade: data.meta_quantidade,
          bonus_meta_pct: data.bonus_meta_pct,
          bonus_super_meta_pct: data.bonus_super_meta_pct,
          pix_key: data.pix_key,
          observacao: data.observacao,
          supervisor_id: data.supervisor_id,
        },
      },
    })

    return NextResponse.json({
      success: true,
      data: {
        id: vendedora.id,
        nome: vendedora.nome,
        email: vendedora.email,
      },
      message: 'Vendedora cadastrada com sucesso!',
    })
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: 'Dados inválidos', details: err.errors }, { status: 400 })
    }
    console.error('[API Vendedoras POST]', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
