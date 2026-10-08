import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifySessionToken, getCookieName } from '@/lib/auth-parceiro'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

function getCompanyIdFromCookie(req: NextRequest): string | null {
  const token = req.cookies.get(getCookieName())?.value
  if (token) {
    const session = verifySessionToken(token)
    if (session) return session.companyId
  }
  const active = req.cookies.get('psh_session_company')?.value
  if (active) return active
  return null
}

/**
 * GET /api/admin/sales-breakdown?mes=YYYY-MM
 *
 * Mostra o breakdown completo do mês:
 *   - Vendas (qtd, valor bruto)
 *   - Comissão ML (o que o ML cobrou)
 *   - Tarifa fixa (FLEX)
 *   - Frete (FULL/cross desconta)
 *   - Bonus envio (reembolsa)
 *   - Bonus cupom
 *   - Custo flex (FLEX, vai pro CMV)
 *   - CMV (custo dos produtos)
 *   - Recebimento líquido (o que cai na sua conta)
 *   - Lucro (recebimento - CMV)
 */
export async function GET(req: NextRequest) {
  // Bypass: Basic Auth ou secret = matriz (visão geral)
  const authHeader = req.headers.get('authorization') || ''
  const _sp = new URL(req.url).searchParams
  const secret = _sp.get('secret')
  let companyId: string | null = null
  if (authHeader.startsWith('Basic ') || secret === 'LUXO2026') {
    companyId = 'e2633570-74da-4b14-9ca1-ba7b0670e612' // LIURAESSENCE matriz
  } else {
    companyId = getCompanyIdFromCookie(req)
    if (!companyId) return NextResponse.json({ ok: false, error: 'Não logado' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const mes = searchParams.get('mes') || (() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })()

  const [y, m] = mes.split('-').map(Number)
  // BRT: mês vai de dia 1 00:00 BRT até último dia 23:59 BRT
  const start = new Date(Date.UTC(y, m - 1, 1, 3, 0, 0))
  const end = new Date(Date.UTC(y, m, 1, 2, 59, 59))

  try {
    const rows: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        COUNT(o.id)::int AS vendas,
        COALESCE(SUM(o.total), 0)::float AS receita_bruta,
        COALESCE(SUM(o.comissao_seller_valor), 0)::float AS comissao_ml,
        COALESCE(SUM(o.tarifa_fixa_valor), 0)::float AS tarifa_fixa,
        COALESCE(SUM(o.frete), 0)::float AS frete,
        COALESCE(SUM(o.bonus_envio_valor), 0)::float AS bonus_envio,
        COALESCE(SUM(o.bonus_cupom_valor), 0)::float AS bonus_cupom,
        COALESCE(SUM(o.custo_flex), 0)::float AS custo_flex,
        COALESCE(SUM(o.recebimento_liquido), 0)::float AS recebimento,
        -- USA orders.custo_total (que foi recalculado) — fonte da verdade
        COALESCE(SUM(o.custo_total), 0)::float AS cmv_produto
      FROM orders o
      WHERE o.company_id = $1::uuid
        AND o.created_at >= $2
        AND o.created_at < $3
        AND (o.status IS NULL OR o.status NOT IN ('cancelado', 'devolvido'))
    `, companyId, start, end)

    const r = rows[0] || {}
    const vendas = Number(r.vendas || 0)
    const receitaBruta = Number(r.receita_bruta || 0)
    const comissao = Number(r.comissao_ml || 0)
    const tarifaFixa = Number(r.tarifa_fixa || 0)
    const frete = Number(r.frete || 0)
    const bonusEnvio = Number(r.bonus_envio || 0)
    const bonusCupom = Number(r.bonus_cupom || 0)
    const custoFlex = Number(r.custo_flex || 0)
    const recebimento = Number(r.recebimento || 0)
    const cmvProduto = Number(r.cmv_produto || 0)
    const cmvTotal = cmvProduto + custoFlex
    const lucro = recebimento - cmvTotal

    return NextResponse.json({
      ok: true,
      mes,
      vendas,
      // O QUE O CLIENTE PAGOU (gross)
      receita_bruta: Number(receitaBruta.toFixed(2)),
      // O QUE O ML COBROU
      comissao_ml: Number(comissao.toFixed(2)),
      tarifa_fixa_flex: Number(tarifaFixa.toFixed(2)),
      frete_pago: Number(frete.toFixed(2)),
      // O QUE O ML REEMBOLSA
      bonus_envio_recebido: Number(bonusEnvio.toFixed(2)),
      bonus_cupom_recebido: Number(bonusCupom.toFixed(2)),
      // CUSTOS (CMV)
      cmv_produto: Number(cmvProduto.toFixed(2)),
      cmv_flex_carrier: Number(custoFlex.toFixed(2)),
      cmv_total: Number(cmvTotal.toFixed(2)),
      // O QUE CAI NA SUA CONTA
      recebimento_liquido: Number(recebimento.toFixed(2)),
      // LUCRO REAL
      lucro: Number(lucro.toFixed(2)),
      margem_pct: recebimento > 0 ? Number(((lucro / recebimento) * 100).toFixed(1)) : 0,
      // Resumo
      explicacao: {
        receita_bruta: 'Total que clientes pagaram (sem descontar nada)',
        comissao_ml: 'Comissão que o ML cobra (12% + tarifa fixa FLEX)',
        frete_pago: 'Frete que o ML desconta do receb (FULL/cross)',
        bonus_envio: 'Bonus que o ML devolve (FULL/cross quando você ganha)',
        bonus_cupom: 'Bonus por cupom (reembolsa parte da comissão)',
        recebimento_liquido: 'O que CAI NA SUA CONTA depois de tudo',
        cmv_produto: 'Custo das mercadorias vendidas',
        cmv_flex_carrier: 'Custo do carrier FLEX (R$13,90 por venda)',
        lucro: 'O que SOBRA pra você (recebimento - CMV)',
      },
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}