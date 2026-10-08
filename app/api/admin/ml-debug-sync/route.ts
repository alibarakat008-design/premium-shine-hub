import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/ml-debug-sync?company_id=X
 * Tenta sincronizar vendas dessa company pra debugar
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Basic ${Buffer.from('premium:shine2026').toString('base64')}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const companyId = searchParams.get('company_id')

  if (!companyId) {
    return NextResponse.json({ ok: false, error: 'company_id obrigatório' }, { status: 400 })
  }

  try {
    // Pega token da empresa
    const compRes: any[] = await prisma.$queryRawUnsafe(
      `SELECT id, nome_fantasia, cnpj, access_token_ml, refresh_token_ml, ml_user_id FROM companies WHERE id = $1::uuid`,
      companyId,
    )
    if (compRes.length === 0) {
      return NextResponse.json({ ok: false, error: 'Empresa não encontrada' })
    }
    const comp = compRes[0]

    // Tenta também marketplace_accounts
    const maRes: any[] = await prisma.$queryRawUnsafe(
      `SELECT id, access_token, refresh_token, token_expira_em FROM marketplace_accounts WHERE company_id = $1::uuid AND plataforma = 'mercado_livre'`,
      companyId,
    )

    const result: any = {
      company: { id: comp.id, nome: comp.nome_fantasia, cnpj: comp.cnpj },
      has_companies_token: !!comp.access_token_ml && comp.access_token_ml !== '__PENDING__',
      companies_token_preview: comp.access_token_ml?.substring(0, 10),
      ml_user_id_companies: comp.ml_user_id ? Number(comp.ml_user_id) : null,
      has_marketplace_token: maRes.length > 0 && !!maRes[0].access_token,
      marketplace_token_preview: maRes[0]?.access_token?.substring(0, 10),
    }

    // Testa /orders/search com o token disponível
    let tokenToUse = null
    let tokenSource = null
    if (comp.access_token_ml && comp.access_token_ml !== '__PENDING__') {
      tokenToUse = comp.access_token_ml
      tokenSource = 'companies'
    } else if (maRes[0]?.access_token) {
      tokenToUse = maRes[0].access_token
      tokenSource = 'marketplace_accounts'
    }

    if (!tokenToUse) {
      return NextResponse.json({ ok: false, error: 'Sem token pra testar', debug: result })
    }

    // Faz a chamada de API: /users/me pra confirmar
    const meRes = await fetch('https://api.mercadolibre.com/users/me', {
      headers: { Authorization: `Bearer ${tokenToUse}` },
    })
    const meData = meRes.ok ? await meRes.json() : { error: await meRes.text() }

    // Faz a chamada de API: /orders/search SEM seller=me (deixar ML decidir)
    const dateFrom = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()

    // Teste 1: SEM filtros
    const tests: any = {}

    const r1 = await fetch(`https://api.mercadolibre.com/orders/search?order.status=paid&order.date_closed.from=${dateFrom}&sort=date_desc&limit=5`, {
      headers: { Authorization: `Bearer ${tokenToUse}` },
    })
    tests.no_filter = { status: r1.status }
    if (r1.ok) {
      const d = await r1.json()
      tests.no_filter.total = d.paging?.total || d.results?.length || 0
      tests.no_filter.first = (d.results || []).slice(0, 3).map((o: any) => ({ id: o.id, seller_id: o.seller?.id, status: o.status, date_closed: o.date_closed, total: o.total_amount }))
    } else {
      tests.no_filter.body = (await r1.text()).substring(0, 300)
    }

    // Teste 2: COM seller=me
    const r2 = await fetch(`https://api.mercadolibre.com/orders/search?seller=me&order.status=paid&order.date_closed.from=${dateFrom}&sort=date_desc&limit=5`, {
      headers: { Authorization: `Bearer ${tokenToUse}` },
    })
    tests.seller_me = { status: r2.status }
    if (r2.ok) {
      const d = await r2.json()
      tests.seller_me.total = d.paging?.total || d.results?.length || 0
    } else {
      tests.seller_me.body = (await r2.text()).substring(0, 300)
    }

    // Teste 3: COM seller=ID_EXPLICITO (user_id do /users/me)
    const sellerId = meData?.id || comp.ml_user_id
    const r3 = await fetch(`https://api.mercadolibre.com/orders/search?seller=${sellerId}&order.status=paid&order.date_closed.from=${dateFrom}&sort=date_desc&limit=5`, {
      headers: { Authorization: `Bearer ${tokenToUse}` },
    })
    tests.seller_explicit = { status: r3.status, seller_id_used: sellerId }
    if (r3.ok) {
      const d = await r3.json()
      tests.seller_explicit.total = d.paging?.total || d.results?.length || 0
    } else {
      tests.seller_explicit.body = (await r3.text()).substring(0, 300)
    }

    result.api_test = {
      token_source: tokenSource,
      token_user_id: meData?.id,
      token_user_nickname: meData?.nickname,
    }
    result.tests = tests

    return NextResponse.json({ ok: true, debug: result })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}