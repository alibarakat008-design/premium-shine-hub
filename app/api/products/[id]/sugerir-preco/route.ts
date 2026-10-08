/**
 * =====================================================
 * API: Sugestão de Preço
 * =====================================================
 * GET /api/products/:id/sugerir-preco?margem=40
 *
 * Calcula o preço ideal de venda baseado em:
 *   - Custo do produto
 *   - Margem alvo desejada
 *   - Comissão ML (~13% no Clássico, ~17% no Premium)
 *   - Impostos (estimativa)
 *   - Frete (se Mercado Envios Full)
 *
 * Retorna 3 cenários: Conservador, Recomendado, Agressivo
 * =====================================================
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params
    const { searchParams } = new URL(request.url)
    const margemAlvo = parseFloat(searchParams.get('margem') || '40') / 100
    const comissaoML = parseFloat(searchParams.get('comissao') || '14') / 100 // 14% ML clássico
    const impostos = parseFloat(searchParams.get('impostos') || '8') / 100
    const envioFull = searchParams.get('full') === 'true'
    const freteFull = envioFull ? 80 : 0 // Custo estimado de envio Full

    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    const product = await prisma.products.findFirst({
      where: isUUID ? { id } : { sku: id },
      include: {
        product_prices: { where: { canal: 'mercado_livre' } },
        marketplace_listings: { take: 1 },
        inventory: true,
      },
    })

    if (!product) {
      return NextResponse.json({ success: false, error: 'Produto não encontrado' }, { status: 404 })
    }

    const mlPrice = product.product_prices?.[0]
    const custo = Number(mlPrice?.custo || product.inventory?.custo_medio || 0)
    const mlListing = product.marketplace_listings?.[0]
    const precoAtual = Number(mlListing?.preco_atual || mlPrice?.preco_venda || 0)

    if (custo <= 0) {
      return NextResponse.json({
        success: false,
        error: 'Cadastre o custo do produto antes de calcular sugestão de preço',
      }, { status: 400 })
    }

    // Fórmula do preço:
    // preco = (custo + freteFull) / (1 - margemAlvo - comissaoML - impostos)

    function calcPreco(cenario: 'conservador' | 'recomendado' | 'agressivo') {
      let margem = margemAlvo
      if (cenario === 'conservador') margem = margemAlvo + 0.05 // margem maior
      if (cenario === 'agressivo') margem = Math.max(margemAlvo - 0.05, 0.05)

      const custoTotal = custo + (envioFull ? freteFull : 0)
      const fator = 1 - margem - comissaoML - impostos
      const preco = fator > 0 ? custoTotal / fator : 0
      const lucro = preco - custoTotal
      return {
        cenario,
        preco_sugerido: Math.round(preco * 100) / 100,
        custo,
        frete: envioFull ? freteFull : 0,
        custo_total: custoTotal,
        lucro_por_unidade: Math.round(lucro * 100) / 100,
        margem_pct: Math.round(margem * 10000) / 100,
        margem_real_pct: preco > 0 ? Math.round((lucro / preco) * 10000) / 100 : 0,
        comissao_ml: Math.round(preco * comissaoML * 100) / 100,
        impostos: Math.round(preco * impostos * 100) / 100,
      }
    }

    const cenarios = {
      conservador: calcPreco('conservador'),
      recomendado: calcPreco('recomendado'),
      agressivo: calcPreco('agressivo'),
    }

    return NextResponse.json({
      success: true,
      data: {
        produto: { sku: product.sku, nome: product.nome },
        preco_atual_ml: precoAtual,
        custo,
        margem_alvo_pct: margemAlvo * 100,
        comissao_ml_pct: comissaoML * 100,
        impostos_pct: impostos * 100,
        envio_full: envioFull,
        cenarios,
        recomendacao: precoAtual > 0 && precoAtual < cenarios.recomendado.preco_sugerido * 0.95
          ? '⚠️ Seu preço atual está ABAIXO do recomendado. Considere aumentar.'
          : precoAtual > cenarios.recomendado.preco_sugerido * 1.20
            ? '💡 Seu preço atual está ALTO. Pode perder vendas.'
            : '✅ Seu preço atual está na faixa recomendada.',
      },
    })
  } catch (err: any) {
    console.error('[API Sugerir Preço]', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
