/**
 * =====================================================
 * API: Buscar CEP (ViaCEP)
 * =====================================================
 * GET /api/cep/:cep
 *
 * Retorna dados do endereço + calcula frete
 * =====================================================
 */

// app/api/cep/[cep]/route.ts

import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

interface ViaCepResponse {
  cep: string
  logradouro: string
  complemento: string
  bairro: string
  localidade: string
  uf: string
  ibge: string
  gia: string
  ddd: string
  siafi: string
  erro?: boolean
}

export async function GET(request: NextRequest, { params }: { params: { cep: string } }) {

  const cep = params.cep.replace(/\D/g, '')

  if (cep.length !== 8) {
    return NextResponse.json(
      { success: false, error: 'CEP inválido. Use 8 dígitos.' },
      { status: 400 }
    )
  }

  try {
    // 1) Buscar CEP no ViaCEP (grátis, sem rate limit)
    const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
      next: { revalidate: 86400 }, // cache 24h
    })

    if (!res.ok) {
      return NextResponse.json(
        { success: false, error: 'CEP não encontrado' },
        { status: 404 }
      )
    }

    const data: ViaCepResponse = await res.json()

    if (data.erro) {
      return NextResponse.json(
        { success: false, error: 'CEP não existe' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: {
        cep: data.cep,
        logradouro: data.logradouro,
        complemento: data.complemento,
        bairro: data.bairro,
        cidade: data.localidade,
        estado: data.uf,
        ddd: data.ddd,
        ibge: data.ibge,
      },
    })
  } catch (err: any) {
    console.error('[API CEP]', err)
    return NextResponse.json(
      { success: false, error: 'Erro ao buscar CEP' },
      { status: 500 }
    )
  }
}
