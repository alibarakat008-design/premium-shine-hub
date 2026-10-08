/**
 * =====================================================
 * MÓDULO DE AFILIADOS
 * =====================================================
 *
 * Pessoas que indicam clientes. Ganham comissão
 * por cada venda feita através do link único.
 *
 * Fluxo:
 *   1) Afiliado se cadastra (público)
 *   2) Gera links únicos (por produto ou geral)
 *   3) Compartilha em redes sociais
 *   4) Cliente clica, compra, sistema rastreia
 *   5) Comissão creditada pro afiliado
 *   6) Saque via PIX quando atingir mínimo
 *
 * Arquivos:
 *   - app/api/afiliados/route.ts          — CRUD + cadastro público
 *   - app/api/afiliados/[id]/dashboard.ts — Performance do afiliado
 *   - app/api/afiliados/saque.ts          — Solicitar saque
 *   - app/api/track/affiliate.ts          — Tracking de cliques
 *   - app/afiliado/page.tsx               — Dashboard do afiliado logado
 *   - app/afiliado/cadastro/page.tsx      — Cadastro público
 *   - app/admin/afiliados/page.tsx        — Gestão admin
 * =====================================================
 */

// =====================================================
// 1) CADASTRO PÚBLICO DE AFILIADO
// =====================================================
// app/api/afiliados/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import bcrypt from 'bcryptjs'

export const dynamic = 'force-dynamic'

const CreateAfiliadoSchema = z.object({
  nome: z.string().min(3),
  email: z.string().email(),
  telefone: z.string().min(10),
  cpf: z.string().min(11),
  password: z.string().min(6),
  // Como será chamado no link
  slug: z.string().min(3).regex(/^[a-z0-9-]+$/),
  pix_key: z.string().min(5), // pra receber pagamentos
  // Configuração
  comissao_pct: z.number().min(0).max(50).default(10),
  // Origem
  origem: z.string().optional(), // 'instagram', 'tiktok', 'amigo', etc
  indicacao_por: z.string().uuid().optional(), // afiliado que indicou este
})

export async function GET() {
  const afiliados = await prisma.users.findMany({
    where: { role: 'afiliado' },
    select: {
      id: true,
      nome: true,
      email: true,
      telefone: true,
      cpf_cnpj: true,
      ativo: true,
      afiliado_data: true,
      last_login: true,
      created_at: true,
      _count: { select: {} },
    },
    orderBy: { created_at: 'desc' },
  })

  return NextResponse.json({ success: true, data: afiliados })
}

export async function POST(request: NextRequest) {

  try {
    const body = await request.json()
    const data = CreateAfiliadoSchema.parse(body)

    // Verificar email
    if (await prisma.users.findUnique({ where: { email: data.email } })) {
      return NextResponse.json({ success: false, error: 'Email já cadastrado' }, { status: 409 })
    }

    // Verificar slug
    if (await prisma.users.findFirst({ where: { afiliado_data: { path: ['slug'], equals: data.slug } } })) {
      return NextResponse.json({ success: false, error: 'Slug já em uso' }, { status: 409 })
    }

    // Hash da senha
    const passwordHash = await bcrypt.hash(data.password, 10)

    // Criar afiliado
    const afiliado = await prisma.users.create({
      data: {
        email: data.email.toLowerCase(),
        password_hash: passwordHash,
        nome: data.nome,
        telefone: data.telefone,
        cpf_cnpj: data.cpf,
        role: 'afiliado',
        afiliado_data: {
          slug: data.slug,
          pix_key: data.pix_key,
          comissao_pct: data.comissao_pct,
          origem: data.origem,
          indicacao_por: data.indicacao_por,
          saldo: 0,
          total_vendas: 0,
          total_comissao: 0,
        },
      },
    })

    // Gerar link padrão
    const link = await prisma.affiliate_links.create({
      data: {
        afiliado_id: afiliado.id,
        slug: data.slug,
        url_completa: `https://premiumshine.com.br/?ref=${data.slug}`,
        cliques: 0,
        vendas: 0,
        comissao_gerada: 0,
      },
    })

    return NextResponse.json({
      success: true,
      data: {
        id: afiliado.id,
        nome: afiliado.nome,
        slug: data.slug,
        link_padrao: link.url_completa,
      },
      message: 'Cadastro realizado! Já pode começar a divulgar.',
    })
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: 'Dados inválidos', details: err.errors }, { status: 400 })
    }
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
