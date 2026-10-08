/**
 * =====================================================
 * API DE API KEYS
 * =====================================================
 * Gerencia chaves de acesso para sites externos
 * (premiumshine.com.br, futuras lojas, etc)
 *
 * Endpoints:
 *   GET    /api/api-keys     — Lista chaves
 *   POST   /api/api-keys     — Cria nova chave
 *   DELETE /api/api-keys/:id — Desativa
 * =====================================================
 */

// app/api/api-keys/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

const CreateApiKeySchema = z.object({
  nome: z.string().min(3),
  descricao: z.string().optional(),
  company_id: z.string().uuid().optional(),
  scopes: z.array(z.enum([
    'read:products',
    'read:categories',
    'read:orders',
    'write:orders',
    'read:inventory',
    'write:inventory',
  ])).default(['read:products']),
  allowed_origins: z.array(z.string()).default([]),
  expira_em: z.string().optional(),
})

export async function GET() {
  const keys = await prisma.api_keys.findMany({
    orderBy: { created_at: 'desc' },
    include: { companies: { select: { nome_fantasia: true } } },
  })

  return NextResponse.json({
    success: true,
    data: keys.map(k => ({
      id: k.id,
      nome: k.nome,
      descricao: k.descricao,
      company: k.companies,
      scopes: k.scopes,
      allowed_origins: k.allowed_origins,
      // NÃO retornar a key completa, só os primeiros 8 caracteres
      key_preview: k.key.substring(0, 12) + '...',
      ativa: k.ativa,
      ultimo_uso: k.ultimo_uso,
      created_at: k.created_at,
      expira_em: k.expira_em,
    })),
  })
}

export async function POST(request: NextRequest) {

  try {
    const body = await request.json()
    const data = CreateApiKeySchema.parse(body)

    // Gerar API Key aleatória
    const keyValue = 'psh_live_' + crypto.randomBytes(32).toString('hex')

    const apiKey = await prisma.api_keys.create({
      data: {
        nome: data.nome,
        descricao: data.descricao,
        company_id: data.company_id,
        key: keyValue,
        scopes: data.scopes,
        allowed_origins: data.allowed_origins,
        expira_em: data.expira_em ? new Date(data.expira_em) : null,
        ativa: true,
      },
    })

    // Retornar a key completa SÓ uma vez (não dá pra recuperar depois)
    return NextResponse.json({
      success: true,
      data: {
        id: apiKey.id,
        nome: apiKey.nome,
        key: apiKey.key, // MOSTRAR APENAS AQUI
        key_preview: apiKey.key.substring(0, 12) + '...',
        scopes: apiKey.scopes,
        allowed_origins: apiKey.allowed_origins,
        message: '⚠️ Salve esta key agora. Por segurança, ela não será exibida novamente.',
      },
    })
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: 'Dados inválidos', details: err.errors }, { status: 400 })
    }
    console.error('[API Keys POST]', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
