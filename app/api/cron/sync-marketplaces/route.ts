/**
 * =====================================================
 * CRON JOB — Sync Automático ML + Shopee
 * Premium Shine Hub
 * =====================================================
 * Roda a cada 15min, sincroniza:
 *   1) Pedidos dos últimos 1 dia (ML + Shopee) — janela curta + limite pra caber no rate limit
 *   2) Estoque do sistema → ML + Shopee
 *   3) Alerta de produtos parados
 *
 * Deploy: Vercel Cron (recomendado, grátis)
 * Configuração: vercel.json
 * =====================================================
 */

// app/api/cron/sync-marketplaces/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { syncOrdersFromML } from '@/lib/mercadolivre/sync'
import { prisma } from '@/lib/prisma'
import { syncProductsFromML } from '@/lib/mercadolivre/sync'
import { syncOrdersFromShopee, syncProductsFromShopee } from '@/lib/shopee/sync'

export const dynamic = 'force-dynamic'

export const maxDuration = 300 // 5 min máximo

interface CronLog {
  started_at: string
  finished_at?: string
  duration_ms?: number
  accounts_processed: number
  results: {
    account_id: string
    nickname: string
    plataforma: string
    status: 'success' | 'error' | 'skipped'
    products_synced?: number
    orders_synced?: number
    has_more_products?: boolean
    error?: string
  }[]
  total_orders_imported: number
  total_errors: number
}

export async function GET(request: NextRequest) {
  // Segurança: aceita Bearer CRON_SECRET (Vercel Cron) OU Basic Auth (manual)
  const authHeader = request.headers.get('authorization') || ''
  const isCronSecret = authHeader === `Bearer ${process.env.CRON_SECRET}`
  const isBasicAuth = authHeader.startsWith('Basic ')
  if (!isCronSecret && !isBasicAuth) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const log: CronLog = {
    started_at: new Date().toISOString(),
    accounts_processed: 0,
    results: [],
    total_orders_imported: 0,
    total_errors: 0,
  }

  try {
    console.log('[Cron] Iniciando sync automático de marketplaces...')

    // 1) Buscar todas as contas ativas
    const accounts = await prisma.marketplace_accounts.findMany({
      where: { ativa: true },
      include: { companies: { select: { id: true, nome_fantasia: true } } },
    })

    log.accounts_processed = accounts.length
    console.log(`[Cron] ${accounts.length} contas ativas encontradas`)

    // 2) Para cada conta, sincronizar
    for (const account of accounts) {
      const accountResult: CronLog['results'][0] = {
        account_id: account.id,
        nickname: account.nickname,
        plataforma: account.plataforma,
        status: 'success',
      }

      try {
        // Verificar se token não expirou
        if (account.token_expira_em && new Date(account.token_expira_em) < new Date()) {
          accountResult.status = 'skipped'
          accountResult.error = 'Token expirado'
          log.results.push(accountResult)
          continue
        }

        // ===== SYNC DE PEDIDOS (últimos 1 dia, max 30 orders) =====
        // Janela curta + limite pra caber no rate limit ML quando roda 4x/hora
        if (account.plataforma === 'mercado_livre') {
          const ordersResult = await syncOrdersFromML(account.id, { days: 1, limit: 30 })
          accountResult.orders_synced = ordersResult.criados
          log.total_orders_imported += ordersResult.criados
          if (ordersResult.erros.length > 0) {
            accountResult.error = ordersResult.erros.slice(0, 3).join('; ')
          }
        } else if (account.plataforma === 'shopee') {
          const ordersResult = await syncOrdersFromShopee(account.id, 1)
          accountResult.orders_synced = ordersResult.criados
          log.total_orders_imported += ordersResult.criados
          if (ordersResult.erros.length > 0) {
            accountResult.error = ordersResult.erros.slice(0, 3).join('; ')
          }
        }

        // ===== SYNC DE PRODUTOS (só se faz 1x por dia) =====
        // Para evitar rate limit, só sincroniza produtos se última sync > 12h
        const lastSync = account.ultima_sincronizacao
          ? new Date(account.ultima_sincronizacao).getTime()
          : 0
        const dozeHoras = 12 * 60 * 60 * 1000
        const precisaSyncProdutos = Date.now() - lastSync > dozeHoras

        if (precisaSyncProdutos) {
          if (account.plataforma === 'mercado_livre') {
            // Sync limitado a 30 produtos pra caber no timeout (5min)
            const productsResult = await syncProductsFromML(account.id, { limit: 30 })
            accountResult.products_synced = productsResult.criados + productsResult.atualizados
            accountResult.has_more_products = productsResult.temMais
          } else if (account.plataforma === 'shopee') {
            const productsResult = await syncProductsFromShopee(account.id)
            accountResult.products_synced = productsResult.criados + productsResult.atualizados
          }
        }

        log.results.push(accountResult)
      } catch (err: any) {
        accountResult.status = 'error'
        accountResult.error = err.message
        log.results.push(accountResult)
        log.total_errors++
        console.error(`[Cron] Erro na conta ${account.nickname}:`, err)
      }
    }

    // 3) Detectar produtos parados (>30 dias sem venda)
    await detectarProdutosParados()

    // 4) Alerta de estoque crítico
    await alertaEstoqueCritico()

    log.finished_at = new Date().toISOString()
    log.duration_ms = new Date(log.finished_at).getTime() - new Date(log.started_at).getTime()

    // 5) Salvar log no banco (desabilitado - tabela cron_logs não existe)
    // await prisma.cron_logs.create({

    console.log(`[Cron] Concluído: ${log.total_orders_imported} pedidos, ${log.total_errors} erros, ${log.duration_ms}ms`)

    return NextResponse.json({
      success: true,
      log,
    })
  } catch (err: any) {
    console.error('[Cron] Erro fatal:', err)
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    )
  } finally {
    await prisma.$disconnect()
  }
}

// =====================================================
// FUNÇÕES AUXILIARES
// =====================================================

async function detectarProdutosParados() {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const produtosParados = await prisma.$queryRaw<any[]>`
    SELECT
      p.id,
      p.sku,
      p.nome,
      i.quantidade_atual,
      MAX(o.created_at) as ultima_venda
    FROM products p
    JOIN inventory i ON p.id = i.product_id
    LEFT JOIN order_items oi ON p.id = oi.product_id
    LEFT JOIN orders o ON oi.order_id = o.id
    WHERE p.ativo = true
    GROUP BY p.id, p.sku, p.nome, i.quantidade_atual
    HAVING MAX(o.created_at) < ${thirtyDaysAgo} OR MAX(o.created_at) IS NULL
    LIMIT 50
  `

  // Criar alertas (mas só 1 por produto)
  for (const p of produtosParados) {
    const existe = await prisma.system_alerts.findFirst({
      where: { tipo: 'produto_parado', product_id: p.id, resolvido: false },
    })
    if (!existe) {
      await prisma.system_alerts.create({
        data: {
          tipo: 'produto_parado',
          severidade: 'warning',
          titulo: `Produto parado há 30+ dias: ${p.sku}`,
          mensagem: `${p.nome} não vende há mais de 30 dias. Estoque: ${p.quantidade_atual} un. Considere promoção ou liquidação.`,
          product_id: p.id,
        },
      })
    }
  }
}

async function alertaEstoqueCritico() {
  const produtosBaixos = await prisma.$queryRaw<any[]>`
    SELECT
      p.id,
      p.sku,
      p.nome,
      i.quantidade_atual,
      i.quantidade_minima
    FROM products p
    JOIN inventory i ON p.id = i.product_id
    WHERE i.quantidade_atual <= i.quantidade_minima
    AND p.ativo = true
    LIMIT 50
  `

  for (const p of produtosBaixos) {
    const existe = await prisma.system_alerts.findFirst({
      where: { tipo: 'estoque_baixo', product_id: p.id, resolvido: false },
    })
    if (!existe) {
      await prisma.system_alerts.create({
        data: {
          tipo: 'estoque_baixo',
          severidade: 'critical',
          titulo: `Estoque crítico: ${p.sku}`,
          mensagem: `${p.nome} tem apenas ${p.quantidade_atual} un (mínimo: ${p.quantidade_minima}). Reabasteça urgente.`,
          product_id: p.id,
        },
      })
    }
  }
}
