/**
 * POST /api/admin/save-promo-preco
 * Salva preco_venda ML com suporte a upsert (INSERT ou UPDATE)
 *
 * Reescrito em 2026-09-01: usava um Personal Access Token do Supabase gravado
 * direto no código (mesmo token exposto em outros arquivos — removido de
 * todos, recomendado revogar no painel do Supabase e gerar um novo) e montava
 * SQL colando valores direto na string (injeção de SQL). product_prices é um
 * model normal do Prisma (sem drift de schema), então agora usa
 * prisma.product_prices.upsert com a unique key [product_id, canal,
 * company_id] já existente no schema — sempre parametrizado.
 */
import { NextRequest, NextResponse } from 'next/server'
import { isMatrizRequest } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'
import { canal_venda } from '@prisma/client'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  if (!isMatrizRequest(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  try {
    const { product_id, preco, canal = 'mercado_livre', company_id = 'e2633570-74da-4b14-9ca1-ba7b0670e612' } = await req.json()
    if (!product_id || preco == null) return NextResponse.json({ ok: false, error: 'product_id e preco obrigatórios' }, { status: 400 })

    if (!Object.values(canal_venda).includes(canal)) {
      return NextResponse.json({ ok: false, error: `canal inválido: ${canal}` }, { status: 400 })
    }

    const saved = await prisma.product_prices.upsert({
      where: {
        product_id_canal_company_id: {
          product_id,
          canal: canal as canal_venda,
          company_id,
        },
      },
      update: {
        preco_venda: parseFloat(preco),
        updated_at: new Date(),
      },
      create: {
        product_id,
        canal: canal as canal_venda,
        company_id,
        preco_venda: parseFloat(preco),
        updated_at: new Date(),
      },
      select: { id: true, preco_venda: true },
    })

    return NextResponse.json({ ok: true, saved })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}
