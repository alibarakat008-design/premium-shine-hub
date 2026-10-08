/**
 * =====================================================
 * API: Preços de Produtos
 * =====================================================
 * POST   /api/product-prices — Criar/atualizar
 * GET    /api/product-prices?product_id=... — Listar
 * =====================================================
 */

// app/api/product-prices/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const PriceSchema = z.object({
  product_id: z.string().uuid(),
  company_id: z.string().uuid().optional(),
  canal: z.enum(['mercado_livre', 'shopee', 'site_b2c', 'whatsapp', 'b2b', 'vendedora']),
  preco_venda: z.number().min(0),
  preco_promocional: z.number().min(0).optional().nullable(),
  custo: z.number().min(0).optional().nullable(),
  preco_minimo: z.number().min(0).optional().nullable(),
  preco_maximo: z.number().min(0).optional().nullable(),
})

export async function POST(request: NextRequest) {

  try {
    const body = await request.json()
    const data = PriceSchema.parse(body)

    const companyId = data.company_id || (await getDefaultCompanyId())

    const price = await prisma.product_prices.upsert({
      where: {
        product_id_canal_company_id: {
          product_id: data.product_id,
          canal: data.canal,
          company_id: companyId,
        },
      },
      update: {
        preco_venda: data.preco_venda,
        preco_promocional: data.preco_promocional,
        custo: data.custo,
        preco_minimo: data.preco_minimo,
        preco_maximo: data.preco_maximo,
        margem_pct: data.custo ? ((data.preco_venda - data.custo) / data.preco_venda) * 100 : null,
        updated_at: new Date(),
      },
      create: {
        product_id: data.product_id,
        company_id: companyId,
        canal: data.canal,
        preco_venda: data.preco_venda,
        preco_promocional: data.preco_promocional,
        custo: data.custo,
        preco_minimo: data.preco_minimo,
        preco_maximo: data.preco_maximo,
        margem_pct: data.custo ? ((data.preco_venda - data.custo) / data.preco_venda) * 100 : null,
      },
    })

    return NextResponse.json({ success: true, data: price })
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: 'Dados inválidos', details: err.errors }, { status: 400 })
    }
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}

async function getDefaultCompanyId(): Promise<string> {
  const company = await prisma.companies.findFirst({ where: { ativa: true } })
  return company?.id || ''
}
