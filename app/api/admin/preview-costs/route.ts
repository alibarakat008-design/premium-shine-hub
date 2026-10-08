import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Faz PREVIEW da importação de custos — mostra o que vai mudar sem aplicar.
 * Aceita POST com body JSON { rows: [{sku, custo}], canal: 'mercado_livre' }
 * OU lê de ?file=1 (pega do filesystem - requer ambiente local)
 */
export async function POST(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const canal = (searchParams.get('canal') || 'mercado_livre') as any
    const body = await req.json()
    const rows: { sku: string; custo: number; titulo?: string }[] = body.rows || []

    if (rows.length === 0) {
      return NextResponse.json({ error: 'rows vazio' }, { status: 400 })
    }

    // Deduplica
    const skuMap = new Map<string, { sku: string; custo: number; titulo?: string }>()
    for (const r of rows) skuMap.set(r.sku, r)
    const unique = Array.from(skuMap.values())
    const skus = unique.map((r) => r.sku)

    // Busca estado atual
    const products = await prisma.products.findMany({
      where: { sku: { in: skus } },
      select: {
        id: true,
        sku: true,
        nome: true,
        product_prices: { where: { canal }, select: { id: true, custo: true } },
      },
    })

    const productMap = new Map(products.map((p) => [p.sku, p]))

    // Classifica cada linha
    interface Preview {
      sku: string
      titulo?: string
      custo_novo: number
      custo_atual: number | null
      acao: 'inserir' | 'atualizar' | 'manter' | 'zerar' | 'suspeito'
      delta: number
    }

    const preview: Preview[] = []
    const stats = { inserir: 0, atualizar: 0, manter: 0, zerar: 0, suspeito: 0 }
    const SKUs_nao_encontrados: string[] = []

    for (const r of unique) {
      const p = productMap.get(r.sku)
      const custoAtual = p?.product_prices?.[0]?.custo ? Number(p.product_prices[0].custo) : null

      let acao: Preview['acao']
      if (!p) {
        SKUs_nao_encontrados.push(r.sku)
        continue // SKU não existe, ignora
      }
      if (custoAtual === null) {
        acao = 'inserir'
      } else if (r.custo === 0 && custoAtual > 0) {
        acao = 'zerar'
      } else if (Math.abs(r.custo - custoAtual) < 0.005) {
        acao = 'manter'
      } else {
        acao = 'atualizar'
      }

      // Suspeito: custo > 1000 (provavelmente typo)
      if (r.custo > 1000) {
        acao = 'suspeito'
      }

      stats[acao] = (stats[acao] || 0) + 1

      preview.push({
        sku: r.sku,
        titulo: r.titulo || p.nome,
        custo_novo: r.custo,
        custo_atual: custoAtual,
        acao,
        delta: custoAtual !== null ? r.custo - custoAtual : r.custo,
      })
    }

    // Ordena: suspeito > zerar > atualizar > manter > inserir
    const ordem = { suspeito: 0, zerar: 1, atualizar: 2, manter: 3, inserir: 4 } as any
    preview.sort((a, b) => ordem[a.acao] - ordem[b.acao] || Math.abs(b.delta) - Math.abs(a.delta))

    return NextResponse.json({
      success: true,
      canal,
      stats: {
        ...stats,
        skus_nao_encontrados: SKUs_nao_encontrados.length,
      },
      preview: preview.slice(0, 200),
      skus_nao_encontrados: SKUs_nao_encontrados,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
