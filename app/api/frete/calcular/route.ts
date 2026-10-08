/**
 * =====================================================
 * API: Calculadora de Frete
 * =====================================================
 * POST /api/frete/calcular
 *   Body: { cep_origem, cep_destino, peso_kg, altura_cm, largura_cm, profundidade_cm, quantidade }
 *
 * Retorna opções de frete (Pac, Sedex, Mercado Envios)
 *   - Tabela fixa baseada em regras dos Correios
 *   - Prazo estimado
 * =====================================================
 */

import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      cep_origem = '01310100',
      cep_destino,
      peso_kg = 0.3,
      altura_cm = 5,
      largura_cm = 15,
      profundidade_cm = 20,
      quantidade = 1,
    } = body

    if (!cep_destino) {
      return NextResponse.json({ success: false, error: 'cep_destino obrigatório' }, { status: 400 })
    }

    // Validar CEPs
    const cleanOrigem = String(cep_origem).replace(/\D/g, '')
    const cleanDestino = String(cep_destino).replace(/\D/g, '')
    if (cleanOrigem.length !== 8 || cleanDestino.length !== 8) {
      return NextResponse.json({ success: false, error: 'CEP inválido' }, { status: 400 })
    }

    // Calcular distância aproximada entre CEPs (diferença dos primeiros 5 dígitos)
    const dist = Math.abs(parseInt(cleanOrigem.substring(0, 5)) - parseInt(cleanDestino.substring(0, 5)))

    // Peso cúbico
    const pesoCubico = (altura_cm * largura_cm * profundidade_cm) / 6000
    const pesoFinal = Math.max(peso_kg, pesoCubico) * quantidade

    // Tabela de fretes (valores aproximados, baseados em 2025)
    const opcoes = []

    // PAC (até 8 dias úteis)
    const valorPac = Math.max(25, 12 + Math.min(dist * 0.08, 40) + pesoFinal * 8)
    opcoes.push({
      servico: 'PAC',
      icone: '📦',
      prazo_dias: Math.min(3 + Math.floor(dist / 200), 12),
      valor: Math.round(valorPac * 100) / 100,
      tipo: 'economico',
    })

    // SEDEX (até 5 dias úteis)
    const valorSedex = Math.max(35, 22 + Math.min(dist * 0.15, 60) + pesoFinal * 15)
    opcoes.push({
      servico: 'SEDEX',
      icone: '🚀',
      prazo_dias: Math.min(1 + Math.floor(dist / 400), 5),
      valor: Math.round(valorSedex * 100) / 100,
      tipo: 'express',
    })

    // Mercado Envios Full (fullfilment)
    opcoes.push({
      servico: 'Mercado Envios Full',
      icone: '⚡',
      prazo_dias: 2,
      valor: Math.round(valorSedex * 0.7 * 100) / 100,
      tipo: 'full',
      nota: 'Requer estoque no Mercado Livre',
    })

    // Mercado Envios (normal)
    opcoes.push({
      servico: 'Mercado Envios',
      icone: '🏪',
      prazo_dias: Math.min(2 + Math.floor(dist / 300), 8),
      valor: Math.round(valorSedex * 0.85 * 100) / 100,
      tipo: 'mercado_envios',
    })

    return NextResponse.json({
      success: true,
      data: {
        origem: cleanOrigem,
        destino: cleanDestino,
        distancia_estimada_km: dist * 5, // aprox
        peso_kg: pesoFinal,
        peso_cubico_kg: Math.round(pesoCubico * 100) / 100,
        opcoes: opcoes.sort((a, b) => a.valor - b.valor),
        mais_barato: opcoes.reduce((min, o) => o.valor < min.valor ? o : min),
        mais_rapido: opcoes.reduce((min, o) => o.prazo_dias < min.prazo_dias ? o : min),
      },
    })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
