/**
 * =====================================================
 * API: Estatísticas da Conta ML
 * =====================================================
 * GET /api/ml/account-stats?account_id=...
 *
 * Retorna:
 *   - Faturamento total (vendas_total * preco_atual)
 *   - Total de vendas
 *   - Total de produtos
 *   - Por tipo: catálogos vs tradicionais
 *   - Por status: ativos, pausados, fechados
 *   - Top 10 mais vendidos
 *   - Estatísticas de saúde
 * =====================================================
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const accountId = searchParams.get('account_id')

    if (!accountId) {
      return NextResponse.json({ success: false, error: 'account_id obrigatório' }, { status: 400 })
    }

    // Buscar todos listings da conta
    const listings = await prisma.marketplace_listings.findMany({
      where: { account_id: accountId },
      select: {
        id: true,
        listing_id: true,
        permalink: true,
        status: true,
        preco_atual: true,
        vendas_total: true,
        listing_type: true,
        health: true,
        condition: true,
        modo_compra: true,
        data_criacao_ml: true,
        products: {
          select: {
            id: true,
            sku: true,
            nome: true,
            ean: true,
            inventory: { select: { quantidade_atual: true } },
          },
        },
      },
    })

    // Calcular estatísticas
    const totalProdutos = listings.length
    const totalVendas = listings.reduce((acc, l) => acc + (l.vendas_total || 0), 0)
    const faturamentoTotal = listings.reduce(
      (acc, l) => acc + Number(l.preco_atual || 0) * (l.vendas_total || 0),
      0
    )
    const estoqueTotal = listings.reduce(
      (acc, l) => acc + (l.products?.inventory?.quantidade_atual || 0),
      0
    )

    // Por tipo (catálogo vs tradicional)
    const catalogos = listings.filter(
      (l) => l.listing_type === 'gold_special' || l.listing_type === 'catalog'
    )
    const tradicionais = listings.filter(
      (l) => !catalogos.includes(l)
    )

    // Por status
    const porStatus = listings.reduce((acc: any, l) => {
      const s = l.status || 'unknown'
      acc[s] = (acc[s] || 0) + 1
      return acc
    }, {})

    // Por modo de compra
    const porModoCompra = listings.reduce((acc: any, l) => {
      const m = l.modo_compra || 'buy_it_now'
      acc[m] = (acc[m] || 0) + 1
      return acc
    }, {})

    // Saúde média
    const comHealth = listings.filter((l) => l.health != null)
    const saudeMedia = comHealth.length
      ? comHealth.reduce((acc, l) => acc + Number(l.health || 0), 0) / comHealth.length
      : 0

    // Top 10 mais vendidos
    const top10 = [...listings]
      .sort((a, b) => (b.vendas_total || 0) - (a.vendas_total || 0))
      .slice(0, 10)
      .map((l) => ({
        listing_id: l.listing_id,
        permalink: l.permalink,
        nome: l.products?.nome,
        sku: l.products?.sku,
        preco: Number(l.preco_atual || 0),
        vendas: l.vendas_total || 0,
        faturamento: Number(l.preco_atual || 0) * (l.vendas_total || 0),
        listing_type: l.listing_type,
        status: l.status,
      }))

    // Anúncios com problemas (sem vendas + ativos a mais de 30 dias)
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const parados = listings.filter(
      (l) =>
        l.status === 'active' &&
        (l.vendas_total || 0) === 0 &&
        l.data_criacao_ml &&
        new Date(l.data_criacao_ml) < thirtyDaysAgo
    ).length

    return NextResponse.json({
      success: true,
      data: {
        totalProdutos,
        totalVendas,
        faturamentoTotal,
        estoqueTotal,
        catalogos: catalogos.length,
        tradicionais: tradicionais.length,
        saudeMedia: Math.round(saudeMedia * 100) / 100,
        porStatus,
        porModoCompra,
        parados,
        top10,
      },
    })
  } catch (err: any) {
    console.error('[API ML Account Stats]', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
