/**
 * =====================================================
 * API: Cotação do Dólar (AwesomeAPI)
 * =====================================================
 * GET /api/dolar/ptax?days=30
 *
 * Retorna cotação do dólar comercial (venda) dos últimos N dias
 * API: https://economia.awesomeapi.com.br/
 * =====================================================
 */

import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

interface Cotacao {
  data: string
  cotacaoVenda: number
  cotacaoCompra: number
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const days = Math.min(parseInt(searchParams.get('days') || '30'), 365)

    // Cache simples em memória (evita rate limit)
    const cacheKey = `dolar-${days}`
    const cached = (global as any).__dolarCache?.[cacheKey]
    if (cached && Date.now() - cached.ts < 5 * 60 * 1000) {
      return NextResponse.json(cached.data)
    }

    // Tentar pegar histórico com várias APIs (fallback chain)
    let cotacoes: Cotacao[] = []

    // Tentativa 1: Frankfurter API (gratuita, sem rate limit)
    try {
      const inicioStr = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().substring(0, 10)
      const url = `https://api.frankfurter.app/${inicioStr}..?from=USD&to=BRL`
      const res = await fetch(url, { next: { revalidate: 3600 } })
      if (res.ok) {
        const json = await res.json()
        cotacoes = Object.entries(json.rates || {}).map(([data, rates]: [string, any]) => ({
          data,
          cotacaoVenda: rates.BRL,
          cotacaoCompra: rates.BRL,
        })).sort((a, b) => a.data.localeCompare(b.data))
      }
    } catch {}

    // Tentativa 2: AwesomeAPI (se Frankfurter falhou)
    if (cotacoes.length === 0) {
      try {
        const res = await fetch(`https://economia.awesomeapi.com.br/json/daily/USD-BRL/${days}`, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
        })
        if (res.ok) {
          const json = await res.json()
          cotacoes = (json || []).map((row: any) => {
            const data = row.create_date?.substring(0, 10) || new Date(row.timestamp * 1000).toISOString().substring(0, 10)
            return {
              data,
              cotacaoVenda: Number(row.bid),
              cotacaoCompra: Number(row.ask),
            }
          }).reverse()
        }
      } catch {}
    }

    // Tentativa 3: Frankfurter latest (só cotação atual)
    if (cotacoes.length === 0) {
      const res = await fetch('https://api.frankfurter.app/latest?from=USD&to=BRL', { next: { revalidate: 3600 } })
      if (res.ok) {
        const json = await res.json()
        cotacoes = [{
          data: json.date,
          cotacaoVenda: json.rates.BRL,
          cotacaoCompra: json.rates.BRL,
        }]
      }
    }

    if (cotacoes.length === 0) {
      // Última tentativa: cotação fixa como fallback (último valor conhecido)
      // Pra não quebrar a UI
      return NextResponse.json({
        success: true,
        data: {
          atual: { data: new Date().toISOString().substring(0, 10), venda: 5.05, compra: 5.05, variacao_dia_pct: 0 },
          historico: [],
          media_periodo: 5.05,
          maxima: 5.05,
          minima: 5.05,
          fallback: true,
        },
      })
    }

    if (cotacoes.length === 0) {
      return NextResponse.json({ success: false, error: 'Nenhuma cotação encontrada' }, { status: 404 })
    }

    const atual = cotacoes[cotacoes.length - 1]
    const variacao = cotacoes.length > 1
      ? ((atual.cotacaoVenda - cotacoes[cotacoes.length - 2].cotacaoVenda) / cotacoes[cotacoes.length - 2].cotacaoVenda) * 100
      : 0

    const response = {
      success: true,
      data: {
        atual: {
          data: atual.data,
          venda: atual.cotacaoVenda,
          compra: atual.cotacaoCompra,
          variacao_dia_pct: Math.round(variacao * 100) / 100,
        },
        historico: cotacoes,
        media_periodo: Math.round((cotacoes.reduce((acc, c) => acc + c.cotacaoVenda, 0) / cotacoes.length) * 100) / 100,
        maxima: Math.max(...cotacoes.map(c => c.cotacaoVenda)),
        minima: Math.min(...cotacoes.map(c => c.cotacaoVenda)),
      },
    }

    // Cache em memória
    if (!(global as any).__dolarCache) (global as any).__dolarCache = {}
    ;(global as any).__dolarCache[cacheKey] = { ts: Date.now(), data: response }

    return NextResponse.json(response)
  } catch (err: any) {
    console.error('[API Dolar]', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
