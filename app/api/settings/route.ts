/**
 * API: Configurações da Empresa
 * GET /api/settings
 * PUT /api/settings
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const company = await prisma.companies.findFirst({ where: { ativa: true } })
    if (!company) return NextResponse.json({ success: false, error: 'Sem empresa ativa' }, { status: 400 })

    let settings = await prisma.company_settings.findFirst({ where: { company_id: company.id } })
    if (!settings) {
      settings = await prisma.company_settings.create({
        data: { company_id: company.id },
      })
    }
    return NextResponse.json({ success: true, data: settings, company })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const company = await prisma.companies.findFirst({ where: { ativa: true } })
    if (!company) return NextResponse.json({ success: false, error: 'Sem empresa ativa' }, { status: 400 })

    const settings = await prisma.company_settings.upsert({
      where: { id: body.id || (await prisma.company_settings.findFirst({ where: { company_id: company.id } }))?.id || '00000000-0000-0000-0000-000000000000' },
      update: {
        margem_minima: body.margem_minima,
        margem_padrao: body.margem_padrao,
        alerta_estoque: body.alerta_estoque,
        cobertura_dias: body.cobertura_dias,
        comissao_ml: body.comissao_ml,
        comissao_shopee: body.comissao_shopee,
        comissao_b2c: body.comissao_b2c,
        comissao_b2b: body.comissao_b2b,
        comissao_vend: body.comissao_vend,
        dolar_padrao: body.dolar_padrao,
        margem_preco_min_pct: body.margem_preco_min_pct,
        email_nfe: body.email_nfe,
        email_pedidos: body.email_pedidos,
        estoque_minimo_padrao: body.estoque_minimo_padrao,
        dias_alerta_giro: body.dias_alerta_giro,
        updated_at: new Date(),
      },
      create: {
        company_id: company.id,
        margem_minima: body.margem_minima || 20,
        margem_padrao: body.margem_padrao || 50,
        alerta_estoque: body.alerta_estoque || 5,
        cobertura_dias: body.cobertura_dias || 45,
        comissao_ml: body.comissao_ml || 13,
        comissao_shopee: body.comissao_shopee || 14,
        comissao_b2c: body.comissao_b2c || 4,
        comissao_b2b: body.comissao_b2b || 5,
        comissao_vend: body.comissao_vend || 10,
        dolar_padrao: body.dolar_padrao || 5.5,
        margem_preco_min_pct: body.margem_preco_min_pct || 20,
        email_nfe: body.email_nfe,
        email_pedidos: body.email_pedidos,
        estoque_minimo_padrao: body.estoque_minimo_padrao || 5,
        dias_alerta_giro: body.dias_alerta_giro || 60,
      },
    })
    return NextResponse.json({ success: true, message: 'Configurações salvas!', data: settings })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
