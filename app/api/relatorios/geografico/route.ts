/**
 * API: Vendas Geográficas
 * GET /api/relatorios/geografico?meses=6
 *
 * Agrupa vendas por:
 * - UF (estado)
 * - Cidade
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const meses = parseInt(searchParams.get('meses') || '6')

    const dataInicio = new Date()
    dataInicio.setMonth(dataInicio.getMonth() - meses)

    const orders = await prisma.orders.findMany({
      where: { created_at: { gte: dataInicio } },
      select: {
        id: true,
        total: true,
        endereco_entrega: true,
        order_items: { select: { quantidade: true } },
      },
    })

    interface Local {
      uf: string
      cidade: string
      pedidos: number
      receita: number
      unidades: number
    }

    const locaisMap = new Map<string, Local>()

    for (const o of orders) {
      // Tentar extrair do endereco_entrega
      const addr: any = o.endereco_entrega
      if (!addr) continue
      const uf = (addr.state || addr.uf || addr.estado || '').toUpperCase()
      const cidade = addr.city || addr.cidade || 'Desconhecida'
      if (!uf) continue

      const key = `${uf}-${cidade}`
      if (!locaisMap.has(key)) {
        locaisMap.set(key, { uf, cidade, pedidos: 0, receita: 0, unidades: 0 })
      }
      const l = locaisMap.get(key)!
      l.pedidos++
      l.receita += Number(o.total)
      l.unidades += o.order_items.reduce((acc, i) => acc + i.quantidade, 0)
    }

    const locais = Array.from(locaisMap.values()).sort((a, b) => b.receita - a.receita)

    // Por UF
    const ufsMap = new Map<string, { uf: string; pedidos: number; receita: number; cidades: number }>()
    for (const l of locais) {
      if (!ufsMap.has(l.uf)) {
        ufsMap.set(l.uf, { uf: l.uf, pedidos: 0, receita: 0, cidades: 0 })
      }
      const u = ufsMap.get(l.uf)!
      u.pedidos += l.pedidos
      u.receita += l.receita
      u.cidades++
    }
    const ufs = Array.from(ufsMap.values()).sort((a, b) => b.receita - a.receita)

    // Top cidades
    const topCidades = locais.slice(0, 30)
    const topUfs = ufs.slice(0, 27)

    return NextResponse.json({
      success: true,
      data: {
        topUfs,
        topCidades,
        resumo: {
          total_ufs: ufsMap.size,
          total_cidades: locaisMap.size,
          receita_total: locais.reduce((acc, l) => acc + l.receita, 0),
          pedidos_total: locais.reduce((acc, l) => acc + l.pedidos, 0),
        },
      },
    })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
