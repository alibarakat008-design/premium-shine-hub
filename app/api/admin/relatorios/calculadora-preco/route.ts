// GET /api/admin/relatorios/calculadora-preco?sku=X
// Calculadora de preço ideal: simulador de elasticidade
// - Dado histórico de vendas, sugere preço ótimo
// - Simula: "se mudar preço pra X, como ficam vendas e margem?"
// - Considera elasticidade implícita (categoria de produto)

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const sku = searchParams.get('sku')

    if (!sku) {
      // Listar produtos top pra escolher
      const items = await prisma.order_items.groupBy({
        by: ['product_id'],
        _sum: { quantidade: true, preco_total: true },
        orderBy: { _sum: { preco_total: 'desc' } },
        take: 100,
      })
      const products = await prisma.products.findMany({
        where: { id: { in: items.map((i) => i.product_id).filter(Boolean) as string[] } },
        select: { id: true, sku: true, nome: true, product_prices: { take: 1, select: { custo: true, preco_venda: true } } },
      })
      return NextResponse.json({
        ok: true,
        produtos: products.map((p) => ({
          id: p.id,
          sku: p.sku,
          nome: p.nome,
          preco_atual: Number(p.product_prices?.[0]?.preco_venda || 0),
          custo: Number(p.product_prices?.[0]?.custo || 0),
        })),
      })
    }

    const prod = await prisma.products.findUnique({
      where: { sku },
      select: {
        id: true, sku: true, nome: true, genero: true, marca_id: true,
        brands: { select: { id: true, nome: true } },
        product_prices: { take: 1, orderBy: { preco_venda: 'desc' }, select: { custo: true, preco_venda: true, preco_promocional: true } },
      },
    })
    if (!prod) return NextResponse.json({ ok: false, error: 'Produto não encontrado' }, { status: 404 })

    const precoAtual = Number(prod.product_prices?.[0]?.preco_venda || 0)
    const custo = Number(prod.product_prices?.[0]?.custo || 0)

    // Histórico de vendas
    const items = await prisma.order_items.findMany({
      where: { products: { sku } },
      select: {
        quantidade: true,
        preco_unitario: true,
        orders: { select: { created_at: true, status: true } },
      },
    })

    // Agrupa por mês com preço médio
    const historico: { mes: string; unidades: number; preco_medio: number; receita: number }[] = []
    const mapMes = new Map<string, { qty: number; receita: number; count: number }>()
    for (const it of items) {
      if (!it.orders.created_at) continue
      const mes = `${it.orders.created_at.getFullYear()}-${String(it.orders.created_at.getMonth() + 1).padStart(2, '0')}`
      if (!mapMes.has(mes)) mapMes.set(mes, { qty: 0, receita: 0, count: 0 })
      const m = mapMes.get(mes)!
      m.qty += it.quantidade
      m.receita += Number(it.preco_unitario || 0) * it.quantidade
      m.count += it.quantidade
    }
    for (const [mes, m] of Array.from(mapMes.entries()).sort()) {
      historico.push({
        mes,
        unidades: m.qty,
        preco_medio: m.count > 0 ? m.receita / m.count : 0,
        receita: m.receita,
      })
    }

    // Calcula elasticidade implícita (correlação preço × quantidade)
    let elasticidade = 0
    if (historico.length >= 3) {
      // Normaliza
      const precos = historico.map((h) => h.preco_medio)
      const qtds = historico.map((h) => h.unidades)
      const mediaP = precos.reduce((s, p) => s + p, 0) / precos.length
      const mediaQ = qtds.reduce((s, q) => s + q, 0) / qtds.length
      let cov = 0
      let varP = 0
      let varQ = 0
      for (let i = 0; i < precos.length; i++) {
        cov += (precos[i] - mediaP) * (qtds[i] - mediaQ)
        varP += Math.pow(precos[i] - mediaP, 2)
        varQ += Math.pow(qtds[i] - mediaQ, 2)
      }
      const corr = varP > 0 && varQ > 0 ? cov / Math.sqrt(varP * varQ) : 0
      // Elasticidade: |corr| assume 1.0 (padrão de bens normais)
      elasticidade = corr < 0 ? -corr : -corr // Se preço alto → vendas baixas, elasticidade negativa
    }

    // Simulação
    const variacoes = [-30, -20, -15, -10, -5, 0, 5, 10, 15, 20, 30]
    const simulacao = variacoes.map((v) => {
      const novoPreco = precoAtual * (1 + v / 100)
      // Aplica elasticidade: variação de demanda = elasticidade * variação de preço
      // Elasticidade implícita: -1 (linear) por padrão
      const elasticidadeEfetiva = elasticidade !== 0 ? Math.abs(elasticidade) : 1
      const variacaoDemanda = -elasticidadeEfetiva * v
      const unidadesBase = historico.length > 0 ? historico[historico.length - 1].unidades : 0
      const novasUnidades = Math.max(0, Math.round(unidadesBase * (1 + variacaoDemanda / 100)))
      const novaReceita = novoPreco * novasUnidades
      const novoCustoTotal = custo * novasUnidades
      const novoLucro = novaReceita - novoCustoTotal
      const novaMargem = novoPreco > 0 ? ((novoPreco - custo) / novoPreco) * 100 : 0
      const lucroAtual = precoAtual * unidadesBase - custo * unidadesBase
      return {
        variacao_pct: v,
        novo_preco: Number(novoPreco.toFixed(2)),
        unidades_estimadas: novasUnidades,
        receita_estimada: Number(novaReceita.toFixed(2)),
        lucro_estimado: Number(novoLucro.toFixed(2)),
        margem_pct: Number(novaMargem.toFixed(1)),
        diff_receita: Number((novaReceita - precoAtual * unidadesBase).toFixed(2)),
        diff_lucro: Number((novoLucro - lucroAtual).toFixed(2)),
      }
    })

    // Encontra o preço ótimo (maior lucro)
    const melhor = simulacao.reduce((max, s) => (s.lucro_estimado > max.lucro_estimado ? s : max), simulacao[5] || simulacao[0])

    const insights: any[] = []
    insights.push({
      emoji: '🎯',
      tipo: 'positivo',
      titulo: `Preço ótimo: R$ ${melhor.novo_preco.toFixed(2)} (${melhor.variacao_pct > 0 ? '+' : ''}${melhor.variacao_pct}% vs atual)`,
      detalhe: `Lucro projetado: R$ ${melhor.lucro_estimado.toFixed(0)}. Margem: ${melhor.margem_pct.toFixed(0)}%.`,
    })
    if (melhor.variacao_pct > 5) {
      insights.push({
        emoji: '📈',
        tipo: 'positivo',
        titulo: `Produto pode ser MAIS CARO (+${melhor.variacao_pct}%)`,
        detalhe: `Sem perda significativa de demanda. Margem sobe.`,
      })
    } else if (melhor.variacao_pct < -5) {
      insights.push({
        emoji: '💡',
        tipo: 'info',
        titulo: `Considere REDUZIR ${Math.abs(melhor.variacao_pct)}% o preço`,
        detalhe: `Volume compensa. Receita total maior.`,
      })
    }
    if (elasticidade !== 0) {
      insights.push({
        emoji: '📊',
        tipo: 'info',
        titulo: `Elasticidade detectada: ${Math.abs(elasticidade).toFixed(2)}`,
        detalhe: elasticidade > 0.5 ? 'Alta: mudanças de preço afetam muito as vendas.' : elasticidade > 0.2 ? 'Média: efeito moderado.' : 'Baixa: preço não afeta muito demanda (premium/único).',
      })
    }

    return NextResponse.json({
      ok: true,
      produto: {
        sku: prod.sku,
        nome: prod.nome,
        marca: prod.brands?.nome,
        genero: prod.genero,
        preco_atual: precoAtual,
        custo,
        margem_atual: precoAtual > 0 ? Number(((precoAtual - custo) / precoAtual * 100).toFixed(1)) : 0,
      },
      elasticidade_implicita: Number(elasticidade.toFixed(2)),
      historico,
      simulacao,
      melhor_preco: melhor,
      insights,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message, stack: err.stack }, { status: 500 })
  }
}
