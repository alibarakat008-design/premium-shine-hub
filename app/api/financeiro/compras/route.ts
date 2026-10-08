/**
 * =====================================================
 * API: /api/financeiro/compras
 * Compras de fornecedor (contas a pagar)
 * =====================================================
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {

  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') // 'sugerida' | 'aprovada' | 'enviada' | 'recebida' | 'cancelada'

    const where: any = {}
    if (status) where.status = status

    const compras = await prisma.supplier_purchases.findMany({
      where,
      orderBy: { created_at: 'desc' },
    })

    // Buscar nomes relacionados
    const supplierIds = [...new Set(compras.map(c => c.supplier_id).filter(Boolean))]
    const companyIds = [...new Set(compras.map(c => c.company_id).filter(Boolean))]

    const [suppliers, companies] = await Promise.all([
      prisma.suppliers.findMany({ where: { id: { in: supplierIds } } }),
      prisma.companies.findMany({ where: { id: { in: companyIds } } }),
    ])

    const supplierMap = Object.fromEntries(suppliers.map(s => [s.id, s.nome]))
    const companyMap = Object.fromEntries(companies.map(c => [c.id, c.nome_fantasia || c.razao_social]))

    // Enriquecer com nomes
    const comprasEnriched = compras.map(c => ({
      ...c,
      fornecedor: c.supplier_id ? supplierMap[c.supplier_id] : null,
      empresa: c.company_id ? companyMap[c.company_id] : null,
    }))

    // Totalizadores
    const totais = compras.reduce(
      (acc, c) => {
        const valor = Number(c.valor_total || 0)
        acc.total += valor
        if (c.status === 'sugerida') acc.sugeridas += valor
        if (c.status === 'aprovada') acc.aprovadas += valor
        if (c.status === 'enviada') acc.enviadas += valor
        if (c.status === 'recebida') acc.recebidas += valor
        return acc
      },
      { total: 0, sugeridas: 0, aprovadas: 0, enviadas: 0, recebidas: 0 }
    )

    return NextResponse.json({
      success: true,
      data: comprasEnriched,
      totais,
    })
  } catch (err: any) {
    console.error('[API Compras]', err)
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    )
  }
}
