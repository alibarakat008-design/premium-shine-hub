/**
 * API: Multi-Contas Mercado Livre Hub
 * GET /api/ml/accounts-hub - lista contas com métricas
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// Formata o tempo até a expiração do token de forma legível, tratando
// separadamente o caso "já expirou há X" do caso "expira em X" — antes os
// dois casos apareciam misturados como "-476h"/"5h" na tela.
function formatTokenExpira(expiraEmHoras: number | null): string {
  if (expiraEmHoras === null) return 'N/A'
  if (expiraEmHoras <= 0) {
    const horasAtras = Math.abs(expiraEmHoras)
    if (horasAtras < 24) return `expirado há ${horasAtras}h`
    return `expirado há ${Math.floor(horasAtras / 24)}d`
  }
  if (expiraEmHoras < 24) return `expira em ${expiraEmHoras}h`
  return `expira em ${Math.floor(expiraEmHoras / 24)}d`
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const plataforma = searchParams.get('plataforma') || 'mercado_livre'
    console.log('[accounts-hub] plataforma:', plataforma, 'ts:', Date.now())

    const accounts = await prisma.marketplace_accounts.findMany({
      where: { plataforma },
      orderBy: { created_at: 'desc' },
    })

    const resultado = await Promise.all(accounts.map(async (acc) => {
      // Vendas
      const orders = await prisma.orders.findMany({
        where: { marketplace_account_id: acc.id },
        select: { total: true, status: true, created_at: true },
      })

      const totalVendas = orders.length
      const receita = orders.reduce((acc2, o) => acc2 + Number(o.total), 0)
      const ultimaVenda = orders.sort((a, b) => new Date(b.created_at!).getTime() - new Date(a.created_at!).getTime())[0]?.created_at || null

      // Listings
      const listingsCount = await prisma.marketplace_listings.count({ where: { account_id: acc.id } })

      // Token expira
      const tokenExpira = acc.token_expira_em ? new Date(acc.token_expira_em) : null
      const expiraEm = tokenExpira ? Math.floor((tokenExpira.getTime() - Date.now()) / (1000 * 60 * 60)) : null
      const tokenExpirado = expiraEm !== null && expiraEm <= 0

      return {
        id: acc.id,
        nome: acc.nickname || acc.account_id || 'Conta ML',
        nickname: acc.nickname,
        email: null,
        ativo: acc.ativa,
        conectado: !!acc.access_token,
        token_expira_em: formatTokenExpira(expiraEm),
        token_expirado: tokenExpirado,
        // "expirando" agora só cobre quem ainda não expirou mas está prestes a
        // (menos de 6h) — token já expirado vira 'token_expirado', não isso.
        expira_hoje: expiraEm !== null && !tokenExpirado && expiraEm < 6,
        total_listings: listingsCount,
        total_vendas: totalVendas,
        receita_total: receita,
        ultima_venda: ultimaVenda,
        last_sync: acc.ultima_sincronizacao,
        created_at: acc.created_at,
      }
    }))

    const countConectados = resultado.filter(a => a.conectado).length
    console.log('[accounts-hub] returning', resultado.length, 'accounts,', countConectados, 'conectados, liura:', resultado.find(a => a.id === 'a1b80278-bc5c-4d3c-a2bc-e3c03f136228')?.conectado)
    return NextResponse.json(
      { success: true, data: resultado },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      }
    )
  } catch (err: any) {
    console.error('[accounts-hub] error:', err.message)
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
