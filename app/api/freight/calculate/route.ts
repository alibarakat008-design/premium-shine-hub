/**
 * =====================================================
 * API: Calcular Frete
 * =====================================================
 * POST /api/freight/calculate
 * Body: { cep_destino, itens: [{sku, quantidade}], subtotal }
 *
 * Retorna opções de frete (PAC, SEDEX, transportadora)
 * =====================================================
 */

// app/api/freight/calculate/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

interface FreightOption {
  servico: string
  prazo_dias: number
  valor: number
  transportadora: string
  tipo: 'PAC' | 'SEDEX' | 'TRANSPORTADORA'
}

export async function POST(request: NextRequest) {

  try {
    const { cep_destino, itens, subtotal } = await request.json()

    if (!cep_destino || !itens || itens.length === 0) {
      return NextResponse.json({ success: false, error: 'CEP e itens obrigatórios' }, { status: 400 })
    }

    // 1) Buscar CEP de origem (do cadastro da empresa)
    // Por enquanto, fixo em São Paulo (CEP 01310-100)
    const cepOrigem = process.env.ORIGEM_CEP || '01310100'

    // 2) Calcular peso e dimensões (soma dos produtos)
    let pesoTotal = 0
    let valorTotal = 0

    for (const item of itens) {
      const produto = await prisma.products.findFirst({
        where: { sku: item.sku },
      })
      if (!produto) continue

      // Estimativa de peso por volume
      const peso = calcularPeso(produto.volume)
      pesoTotal += peso * item.quantidade

      // Pegar preço
      const preco = await prisma.product_prices.findFirst({
        where: { product_id: produto.id, canal: 'site_b2c' },
      })
      if (preco) valorTotal += Number(preco.preco_venda) * item.quantidade
    }

    // 3) Calcular opções de frete
    const opcoes: FreightOption[] = []

    // Frete grátis acima de R$ 150
    const freteGratis = subtotal >= 150

    if (freteGratis) {
      opcoes.push({
        servico: 'FRETE GRÁTIS',
        prazo_dias: 7,
        valor: 0,
        transportadora: 'Correios PAC',
        tipo: 'PAC',
      })
    }

    // PAC
    opcoes.push({
      servico: 'PAC',
      prazo_dias: calcularPrazoPAC(cep_destino),
      valor: calcularValorPAC(cep_destino, pesoTotal, valorTotal, freteGratis),
      transportadora: 'Correios',
      tipo: 'PAC',
    })

    // SEDEX
    opcoes.push({
      servico: 'SEDEX',
      prazo_dias: calcularPrazoSEDEX(cep_destino),
      valor: calcularValorSEDEX(cep_destino, pesoTotal, valorTotal),
      transportadora: 'Correios',
      tipo: 'SEDEX',
    })

    // Transportadora privada (Jadlog, Total Express)
    opcoes.push({
      servico: 'Jadlog .Package',
      prazo_dias: 5,
      valor: calcularValorJadlog(cep_destino, pesoTotal, valorTotal),
      transportadora: 'Jadlog',
      tipo: 'TRANSPORTADORA',
    })

    return NextResponse.json({
      success: true,
      data: {
        cep_destino,
        peso_kg: pesoTotal.toFixed(2),
        valor_produtos: valorTotal.toFixed(2),
        opcoes: opcoes.filter(o => o.valor !== null).sort((a, b) => a.valor - b.valor),
      },
    })
  } catch (err: any) {
    console.error('[API Freight]', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}

// =================== CÁLCULOS SIMPLIFICADOS ===================
// Em produção, integraria com API dos Correios/Jadlog

function calcularPeso(volume?: string | null): number {
  if (!volume) return 0.3
  const ml = parseInt(volume.replace(/\D/g, ''))
  if (ml <= 15) return 0.1 // 15ml
  if (ml <= 50) return 0.2
  if (ml <= 100) return 0.3
  if (ml <= 200) return 0.4
  if (ml <= 500) return 0.6
  return 1.0
}

function calcularPrazoPAC(cep: string): number {
  const estado = getEstadoPorCep(cep)
  const prazos: Record<string, number> = {
    SP: 3, RJ: 5, MG: 5, ES: 5,
    PR: 6, SC: 7, RS: 8,
    BA: 8, PE: 10, CE: 12, RN: 12, PB: 12, AL: 12, SE: 10, MA: 14, PI: 12,
    GO: 6, DF: 6, MT: 10, MS: 8,
    PA: 14, AP: 18, AM: 16, RR: 20, AC: 18, RO: 16, TO: 12,
  }
  return prazos[estado] || 10
}

function calcularPrazoSEDEX(cep: string): number {
  const estado = getEstadoPorCep(cep)
  const prazos: Record<string, number> = {
    SP: 1, RJ: 2, MG: 2, ES: 2,
    PR: 3, SC: 3, RS: 3,
    BA: 3, PE: 3, CE: 4, RN: 4, PB: 4, AL: 4, SE: 3, MA: 5, PI: 4,
    GO: 2, DF: 2, MT: 4, MS: 3,
    PA: 5, AP: 7, AM: 6, RR: 8, AC: 7, RO: 6, TO: 4,
  }
  return prazos[estado] || 3
}

function calcularValorPAC(cep: string, peso: number, valor: number, gratis: boolean): number {
  if (gratis) return 0

  const estado = getEstadoPorCep(cep)
  const tabela: Record<string, number> = {
    SP: 18, RJ: 24, MG: 26, ES: 26,
    PR: 28, SC: 30, RS: 32,
    BA: 32, PE: 35, CE: 38, RN: 40, PB: 38, AL: 38, SE: 35, MA: 42, PI: 40,
    GO: 28, DF: 28, MT: 35, MS: 32,
    PA: 42, AP: 55, AM: 48, RR: 60, AC: 55, RO: 50, TO: 40,
  }
  let base = tabela[estado] || 35
  base += Math.max(0, peso - 0.5) * 8 // peso extra
  return Math.round(base * 100) / 100
}

function calcularValorSEDEX(cep: string, peso: number, valor: number): number {
  const estado = getEstadoPorCep(cep)
  const tabela: Record<string, number> = {
    SP: 32, RJ: 42, MG: 45, ES: 45,
    PR: 48, SC: 52, RS: 55,
    BA: 55, PE: 60, CE: 65, RN: 68, PB: 65, AL: 65, SE: 60, MA: 70, PI: 68,
    GO: 48, DF: 48, MT: 60, MS: 55,
    PA: 70, AP: 90, AM: 85, RR: 100, AC: 92, RO: 85, TO: 68,
  }
  let base = tabela[estado] || 60
  base += Math.max(0, peso - 0.5) * 15
  return Math.round(base * 100) / 100
}

function calcularValorJadlog(cep: string, peso: number, valor: number): number {
  const estado = getEstadoPorCep(cep)
  const tabela: Record<string, number> = {
    SP: 16, RJ: 22, MG: 24, ES: 24,
    PR: 26, SC: 28, RS: 30,
    BA: 30, PE: 33, CE: 36, RN: 38, PB: 36, AL: 36, SE: 33, MA: 40, PI: 38,
    GO: 26, DF: 26, MT: 32, MS: 30,
    PA: 40, AP: 52, AM: 45, RR: 55, AC: 52, RO: 48, TO: 38,
  }
  let base = tabela[estado] || 32
  base += Math.max(0, peso - 0.5) * 7
  return Math.round(base * 100) / 100
}

function getEstadoPorCep(cep: string): string {
  const prefixo = parseInt(cep.substring(0, 1))
  // Simplificado: primeiros dígitos do CEP indicam região
  // SP: 01-19, RJ: 20-28, MG: 30-39, ES: 29, PR: 80-87, SC: 88-89, RS: 90-99
  if (prefixo === 0) return 'SP'
  if (prefixo === 1) return 'SP'
  if (prefixo === 2 && parseInt(cep.substring(0, 2)) <= 28) return prefixo === 2 && cep.substring(0, 2) === '29' ? 'ES' : 'RJ'
  if (prefixo === 3) return 'MG'
  if (prefixo === 4) return 'BA'
  if (prefixo === 5) return 'PE'
  if (prefixo === 6) return 'CE'
  if (prefixo === 7) return 'DF'
  if (prefixo === 8) return parseInt(cep.substring(0, 2)) <= 87 ? 'PR' : 'SC'
  if (prefixo === 9) return 'RS'
  return 'SP'
}
