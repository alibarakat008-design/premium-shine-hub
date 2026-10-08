/**
 * =====================================================
 * API: Solicitar Saque de Afiliado
 * =====================================================
 * POST /api/afiliados/saque
 * Body: { valor }
 * =====================================================
 */

// app/api/afiliados/saque/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const SAQUE_MINIMO = 50

export async function POST(request: NextRequest) {

  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user.role !== 'afiliado') {
      return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 })
    }

    const { valor } = await request.json()
    const afiliadoId = session.user.id

    // Buscar afiliado
    const user = await prisma.users.findUnique({ where: { id: afiliadoId } })
    if (!user) return NextResponse.json({ success: false, error: 'Não encontrado' }, { status: 404 })

    const data: any = user.afiliado_data || {}
    const saldoAtual = Number(data.saldo || 0)
    const pixKey = data.pix_key

    // Validações
    if (!pixKey) {
      return NextResponse.json({ success: false, error: 'Você não tem PIX cadastrado. Atualize seu cadastro.' }, { status: 400 })
    }
    if (valor < SAQUE_MINIMO) {
      return NextResponse.json({ success: false, error: `Saque mínimo: R$ ${SAQUE_MINIMO.toFixed(2)}` }, { status: 400 })
    }
    if (valor > saldoAtual) {
      return NextResponse.json({ success: false, error: `Saldo insuficiente. Disponível: R$ ${saldoAtual.toFixed(2)}` }, { status: 400 })
    }

    // Registrar solicitação de comissão paga
    const solicitacao = await prisma.commissions_paid.create({
      data: {
        user_id: afiliadoId,
        tipo: 'afiliado',
        mes_referencia: new Date().toISOString().slice(0, 7),
        valor_total: valor,
        valor_pago: 0, // ainda não pago
        forma_pagamento: 'PIX',
        observacao: `Solicitação automática. Chave PIX: ${pixKey}`,
      },
    })

    // Zerar saldo
    await prisma.users.update({
      where: { id: afiliadoId },
      data: {
        afiliado_data: {
          ...data,
          saldo: 0,
        },
      },
    })

    // Criar alerta pro admin
    await prisma.system_alerts.create({
      data: {
        tipo: 'saque_afiliado',
        severidade: 'info',
        titulo: `Saque de afiliado solicitado`,
        mensagem: `Afiliado ${user.nome} solicitou saque de R$ ${valor.toFixed(2)}. Chave PIX: ${pixKey}`,
      },
    })

    return NextResponse.json({
      success: true,
      data: {
        solicitacao_id: solicitacao.id,
        valor,
        pix_key: pixKey,
        prazo: '24h úteis',
      },
      message: 'Saque solicitado com sucesso! PIX será enviado em até 24h úteis.',
    })
  } catch (err: any) {
    console.error('[API Saque Afiliado]', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
