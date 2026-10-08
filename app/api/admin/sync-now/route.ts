/**
 * POST /api/admin/sync-now
 *
 * Sincroniza vendas NOVAS do Mercado Livre pra empresa do user logado.
 * Detecta automaticamente a company via cookie psh_session_company.
 *
 * Auth: Basic Auth (admin) OU cookie de parceiro
 *
 * Body: { hours?: number, force?: boolean }
 *   - hours: janela de tempo pra puxar (default 6h, max 168h = 7 dias)
 *   - force: também processa vendas com erro anterior
 *
 * Returns: { ok, account_id, account_nickname, fetched, new, created, errors, duration_ms, last_run }
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getMLToken } from '@/lib/ml-auth-multi'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const BASIC = 'Basic ' + Buffer.from('premium:shine2026').toString('base64')

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== BASIC) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  let body: any = {}
  try { body = await req.json() } catch {}
  const hours = Math.max(1, Math.min(Number(body.hours || 6), 168))

  // 🔐 PRIVACIDADE MULTI-TENANT: detecta company do user logado
  // Cookies possíveis:
  //   psh_session_company = company do token de login (parceiro/filial) — IMUTÁVEL
  //   psh_active_company  = company que a matriz trocou — pode ser diferente da session
  // psh_session_role     = 'parceiro' | 'filial' | 'matriz'
  const sessionCompanyId = req.cookies.get('psh_session_company')?.value
  const activeCompanyId = req.cookies.get('psh_active_company')?.value
  const sessionRole = req.cookies.get('psh_session_role')?.value

  // Se for parceiro, o company_id do body DEVE ser igual ao do cookie de sessão
  // (parceiro NÃO pode sincronizar vendas de outra empresa)
  if (sessionRole === 'parceiro' && body.company_id && body.company_id !== sessionCompanyId) {
    return NextResponse.json({
      ok: false,
      error: 'Acesso negado: parceiro só pode sincronizar a própria empresa'
    }, { status: 403 })
  }

  // OU pega do body (apenas se for matriz/filial E o company_id bater com a sessão OU active)
  // Para matriz: aceita qualquer company_id do body (pode estar gerenciando várias)
  // Para filial: aceita company_id igual ao session
  let companyId: string | undefined
  if (body.company_id) {
    if (sessionRole === 'parceiro') {
      // já validado acima — tem que ser o próprio
      companyId = body.company_id
    } else {
      // matriz/filial: aceita (matriz pode estar vendo de outra)
      companyId = body.company_id
    }
  } else {
    // Sem body: usa cookie
    companyId = activeCompanyId || sessionCompanyId
  }

  if (!companyId) {
    return NextResponse.json(
      { ok: false, error: 'company_id obrigatório (cookie psh_session_company ou body.company_id)' },
      { status: 400 }
    )
  }

  const t0 = Date.now()

  try {
    // Pega a conta ML
    const acc: any = await prisma.marketplace_accounts.findFirst({
      where: { company_id: companyId, plataforma: 'mercado_livre', ativa: true },
    })
    if (!acc) {
      return NextResponse.json(
        { ok: false, error: 'Nenhuma conta ML ativa encontrada pra esta empresa' },
        { status: 404 }
      )
    }

    // Pega token
    const tokenRes = await getMLToken(companyId)
    if (!tokenRes?.token) {
      return NextResponse.json({ ok: false, error: 'Token ML indisponível' }, { status: 401 })
    }

    // Lista order_ids do ML (janela "hours")
    const dateTo = new Date().toISOString()
    const dateFrom = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
    const allIds: string[] = []
    let offset = 0
    while (true) {
      const url = `https://api.mercadolibre.com/orders/search?seller=${acc.account_id}&order.date_created.from=${dateFrom}&order.date_created.to=${dateTo}&limit=50&offset=${offset}&sort=date_desc`
      const r = await fetch(url, { headers: { Authorization: `Bearer ${tokenRes.token}` } })
      if (r.status === 429) {
        await new Promise(r => setTimeout(r, 65000))
        continue
      }
      if (!r.ok) break
      const j = await r.json()
      const results = j.results || []
      if (results.length === 0) break
      allIds.push(...results.map((o: any) => String(o.id)))
      if (results.length < 50) break
      offset += 50
      if (allIds.length >= 500) break // safety
      await new Promise(r => setTimeout(r, 80))
    }

    // Quais JÁ existem
    const existing: any[] = await prisma.orders.findMany({
      where: { order_number: { in: allIds } },
      select: { order_number: true },
    })
    const existingSet = new Set(existing.map(e => String(e.order_number)))
    const newIds = allIds.filter(id => !existingSet.has(id))

    // Processa via sync-orders-batch em chunks de 25
    let criados = 0
    const errors: string[] = []
    for (let i = 0; i < newIds.length; i += 25) {
      const chunk = newIds.slice(i, i + 25)
      try {
        const r = await fetch(
          `${process.env.NEXT_PUBLIC_BASE_URL || 'https://premium-shine-hub.vercel.app'}/api/admin/sync-orders-batch?ids=${chunk.join(',')}&processExisting=false&account_id=${acc.id}`,
          { headers: { Authorization: BASIC } }
        )
        const j = await r.json()
        criados += j.processed || 0
        if (j.error_samples) errors.push(...j.error_samples.slice(0, 2))
      } catch (e: any) {
        errors.push(e.message?.substring(0, 100) || 'erro desconhecido')
      }
    }

    return NextResponse.json({
      ok: true,
      account_id: acc.id,
      account_nickname: acc.nickname,
      company_id: companyId,
      hours_window: hours,
      fetched: allIds.length,
      new: newIds.length,
      created: criados,
      errors: errors.length,
      error_samples: errors.slice(0, 3),
      duration_ms: Date.now() - t0,
      last_run: new Date().toISOString(),
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}
