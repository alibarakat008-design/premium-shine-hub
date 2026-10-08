/**
 * =====================================================
 * API DE SINCRONIZAÇÃO ML
 * =====================================================
 * Endpoints:
 *   POST /api/ml/sync/products  — Inicia sync (retorna imediato, roda em background)
 *   GET  /api/ml/sync/products?account_id=... — Checa status do sync
 *   POST /api/ml/sync/orders    — Importa pedidos ML → sistema
 *   POST /api/ml/sync/stock     — Atualiza estoque do sistema → ML
 * =====================================================
 */

// app/api/ml/sync/products/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { syncProductsFromML } from '@/lib/mercadolivre/sync'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {

  try {
    const body = await request.json()
    const { account_id, limit, fullSync } = body

    if (!account_id) {
      return NextResponse.json(
        { success: false, error: 'account_id obrigatório' },
        { status: 400 }
      )
    }

    // Verificar se já tem sync rodando
    const account = await prisma.marketplace_accounts.findUnique({
      where: { id: account_id },
      select: { id: true, sync_status: true, sync_progress: true },
    })

    if (!account) {
      return NextResponse.json({ success: false, error: 'Conta não encontrada' }, { status: 404 })
    }

    if (account.sync_status === 'running') {
      return NextResponse.json({
        success: false,
        error: 'Já tem uma sincronização em andamento. Aguarde.',
        data: { progress: account.sync_progress },
      }, { status: 409 })
    }

    // Marcar como running
    await prisma.marketplace_accounts.update({
      where: { id: account_id },
      data: { sync_status: 'running', sync_progress: { etapa: 'iniciando', pct: 0 } },
    })

    // Rodar sync (pode ser em background ou síncrono se ?sync=true)
    const syncMode = new URL(request.url).searchParams.get('sync') === 'true'
    if (syncMode) {
      // Síncrono: aguarda terminar (bom pra testes com limit pequeno)
      try {
        const result = await syncProductsFromML(account_id, { limit, fullSync })
        await prisma.marketplace_accounts.update({
          where: { id: account_id },
          data: {
            sync_status: 'completed',
            sync_progress: { etapa: 'concluído', pct: 100 },
            sync_result: {
              total: result.total,
              criados: result.criados,
              atualizados: result.atualizados,
              erros: result.erros.slice(0, 5),
              temMais: result.temMais,
              finishedAt: new Date().toISOString(),
            },
            ultima_sincronizacao: new Date(),
          },
        })
        return NextResponse.json({
          success: true,
          message: `Sincronização concluída: ${result.criados} criados, ${result.atualizados} atualizados`,
          data: { total: result.total, criados: result.criados, atualizados: result.atualizados, erros: result.erros, temMais: result.temMais },
        })
      } catch (err: any) {
        await prisma.marketplace_accounts.update({
          where: { id: account_id },
          data: { sync_status: 'error', sync_progress: { etapa: 'erro', error: err.message } },
        })
        return NextResponse.json({ success: false, error: err.message }, { status: 500 })
      }
    }

    // Modo padrão: em background (não bloqueia a resposta)
    runSyncInBackground(account_id, { limit, fullSync }).catch(err => {
      console.error('[API ML Sync Products] Background error:', err)
    })

    return NextResponse.json({
      success: true,
      message: 'Sincronização iniciada em background. Acompanhe o progresso na tela.',
      data: { started: true },
    })
  } catch (err: any) {
    console.error('[API ML Sync Products]', err)
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const account_id = searchParams.get('account_id')

    if (!account_id) {
      return NextResponse.json({ success: false, error: 'account_id obrigatório' }, { status: 400 })
    }

    const account = await prisma.marketplace_accounts.findUnique({
      where: { id: account_id },
      select: { sync_status: true, sync_progress: true, sync_result: true, ultima_sincronizacao: true },
    })

    if (!account) {
      return NextResponse.json({ success: false, error: 'Conta não encontrada' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      data: {
        status: account.sync_status || 'idle',
        progress: account.sync_progress,
        resultado: account.sync_result,
        ultima_sincronizacao: account.ultima_sincronizacao,
      },
    })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}

async function runSyncInBackground(accountId: string, options: { limit?: number; fullSync?: boolean }) {
  try {
    // Wrapper que atualiza progresso a cada item
    const result = await syncProductsFromML(accountId, options)

    await prisma.marketplace_accounts.update({
      where: { id: accountId },
      data: {
        sync_status: 'completed',
        sync_progress: { etapa: 'concluído', pct: 100 },
        sync_result: {
          total: result.total,
          criados: result.criados,
          atualizados: result.atualizados,
          erros: result.erros.slice(0, 5), // só primeiros 5
          temMais: result.temMais,
          finishedAt: new Date().toISOString(),
        },
        ultima_sincronizacao: new Date(),
      },
    })
  } catch (err: any) {
    await prisma.marketplace_accounts.update({
      where: { id: accountId },
      data: {
        sync_status: 'error',
        sync_progress: { etapa: 'erro', pct: 0, error: err.message },
      },
    })
  }
}
