/**
 * API: Dashboard LEVE
 * GET /api/admin/dashboard-leve?company_id=X
 *
 * Retorna:
 * - Resumo (receita, vendas, ticket médio, lucro, margem) - 30 dias
 *   COM CUSTOS, FRETE, COMISSÃO REAIS (não assume % fixa)
 * - 12 meses de faturamento e vendas
 * - Top 5 produtos mais vendidos
 * - Impostos/custos fixos/variáveis (monthly_costs), Ads (orders.ads_valor)
 * - Estoque crítico, produtos parados (30+ dias sem venda), próximas ações
 *
 * MULTI-TENANT: filtra por company_id
 *
 * Ampliado em 2026-09-01 pra alimentar o novo layout do Dashboard (barra de
 * composição + cards de Deduções + bloco Próximas ações/Top SKUs/Estoque
 * crítico/Inatividade). ads_valor e marcado* não estão no schema.prisma
 * (drift conhecido — colunas existem no banco real mas não no client Prisma),
 * por isso usam $queryRaw com parâmetros de verdade, igual já é feito em
 * catalogo-produtos/route.ts.
 */
import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function asUuid(v: string | null | undefined): string | null {
  return v && UUID_RE.test(v) ? v : null
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    // MULTI-TENANT — prioridade: ?company_id= > psh_active_company > psh_session_company (se parceiro)
    const explicitCompanyId = searchParams.get('company_id')
    const cookieActive = req.cookies.get('psh_active_company')?.value
    const cookieSession = req.cookies.get('psh_session_company')?.value
    const sessionRole = req.cookies.get('psh_session_role')?.value
    const isMatriz = !sessionRole || sessionRole === 'matriz'

    const companyId = asUuid(
      explicitCompanyId
        || cookieActive
        || (cookieSession && !isMatriz ? cookieSession : null)
    )

    // Período — aceita ?dias=1|7|15|30 (janela corrida, "1" = hoje desde a meia-noite)
    // ou ?from=YYYY-MM-DD&to=YYYY-MM-DD (personalizado). Sem nenhum dos dois, mantém o
    // padrão de sempre: últimos 30 dias.
    const hoje = new Date()
    const fromParam = searchParams.get('from')
    const toParam = searchParams.get('to')
    const diasParam = parseInt(searchParams.get('dias') || '', 10)
    let inicio30: Date
    let fimPeriodo: Date = hoje
    let periodoDias = 30
    if (fromParam && toParam && !isNaN(Date.parse(fromParam)) && !isNaN(Date.parse(toParam))) {
      inicio30 = new Date(fromParam + 'T00:00:00')
      fimPeriodo = new Date(toParam + 'T23:59:59.999')
      periodoDias = Math.max(1, Math.round((fimPeriodo.getTime() - inicio30.getTime()) / (24 * 3600 * 1000)))
    } else {
      const dias = [1, 7, 15, 30].includes(diasParam) ? diasParam : 30
      periodoDias = dias
      inicio30 = dias === 1
        ? new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 0, 0, 0) // "Hoje" = desde a meia-noite
        : new Date(hoje.getTime() - dias * 24 * 3600 * 1000)
    }
    const inicio12m = new Date(hoje.getFullYear(), hoje.getMonth() - 11, 1)

    // Helper: monta WHERE com company
    const companyFilter = companyId ? { company_id: companyId } : {}

    // 1) Orders 30 dias (com comissão, frete, items pra CMV)
    const orders30 = await prisma.orders.findMany({
      where: {
        ...companyFilter,
        created_at: { gte: inicio30, lte: fimPeriodo },
        status: { notIn: ['cancelado', 'devolvido'] },
      },
      select: {
        id: true,
        total: true,
        // Composição da comissão ML (vem do sync)
        tarifa_pct_valor: true,
        tarifa_fixa_valor: true,
        comissao_seller_valor: true,
        // Outros
        frete: true,
        custo_total: true,
        custo_flex: true,
        bonus_envio_valor: true,
        bonus_cupom_valor: true,
        recebimento_liquido: true,
        order_items: {
          select: {
            quantidade: true,
            preco_unitario: true,
            custo_unitario: true,
            products: { select: { id: true, sku: true, nome: true, foto_principal_url: true } },
          },
        },
      },
    })

    // Agregados 30d
    // PROBLEMA: A maioria dos orders NÃO têm tariff_pct_valor nem order_items preenchidos
    // (só ~7% dos orders foram corretamente linkados no sync).
    // Para ter um lucro consistente, estimamos os valores faltantes pela % média
    // dos orders que TÊM dado real.
    const vendas30 = orders30.length
    let receita30 = 0
    let custo_produto_30 = 0
    let comissao_30 = 0  // tarifa_pct + tarifa_fixa (puro ML)
    let tarifa_pct_30 = 0
    let tarifa_fixa_30 = 0
    let frete_30 = 0
    let custo_flex_30 = 0
    let bonus_envio_30 = 0
    let bonus_cupom_30 = 0
    let recebimento_30 = 0
    // CMV: fonte tripla — order_items > custo_total > estimado
    // order_items.custo_unitario tem dado real mas só cobre ~7% dos orders (sync ML parcial).
    // custo_total é fallback pra ~7% dos orders. O resto (86%) é estimado.
    let receitaComCustoReal = 0
    let cmvCustoReal = 0
    let receitaSemCusto = 0
    // Comissão: similar — só ~7% dos orders têm dado real. O resto é estimado.
    let receitaComComissaoReal = 0
    let comissaoReal = 0
    let receitaSemComissao = 0

    for (const o of orders30) {
      receita30 += Number(o.total || 0)
      // Comissão ML: tarifa_pct + tarifa_fixa (sem cupom)
      const pct = o.tarifa_pct_valor != null ? Number(o.tarifa_pct_valor) : 0
      const fixa = o.tarifa_fixa_valor != null ? Number(o.tarifa_fixa_valor) : 0
      const comissaoOrder = pct + fixa
      if (comissaoOrder > 0) {
        comissao_30 += comissaoOrder
        receitaComComissaoReal += Number(o.total || 0)
        comissaoReal += comissaoOrder
      } else {
        receitaSemComissao += Number(o.total || 0)
      }
      tarifa_pct_30 += pct
      tarifa_fixa_30 += fixa
      // Frete: real
      frete_30 += o.frete != null ? Number(o.frete) : 0
      // CMV: PRIORIDADE 1 — order_items (custo real por SKU)
      let cmvOrder = 0
      for (const it of o.order_items) {
        cmvOrder += Number(it.custo_unitario || 0) * (it.quantidade || 0)
      }
      // CMV: PRIORIDADE 2 — custo_total do order (backfill do sync ML)
      const custoTotalOrder = o.custo_total != null ? Number(o.custo_total) : 0
      if (cmvOrder === 0 && custoTotalOrder > 0) cmvOrder = custoTotalOrder
      if (cmvOrder > 0) {
        custo_produto_30 += cmvOrder
        receitaComCustoReal += Number(o.total || 0)
        cmvCustoReal += cmvOrder
      } else {
        receitaSemCusto += Number(o.total || 0)
      }
      // Custo FLEX (carrier R$ 13.90)
      custo_flex_30 += o.custo_flex != null ? Number(o.custo_flex) : 0
      // Bônus
      bonus_envio_30 += o.bonus_envio_valor != null ? Number(o.bonus_envio_valor) : 0
      bonus_cupom_30 += o.bonus_cupom_valor != null ? Number(o.bonus_cupom_valor) : 0
      // Recebimento (só pra exibição)
      recebimento_30 += o.recebimento_liquido != null ? Number(o.recebimento_liquido) : 0
    }
    // Estimativas: % médio dos orders COM dado real
    const cmvPctConhecido = receitaComCustoReal > 0 ? (cmvCustoReal / receitaComCustoReal) : 0.55
    const comissaoPctConhecido = receitaComComissaoReal > 0 ? (comissaoReal / receitaComComissaoReal) : 0.12
    const cmvEstimado = receitaSemCusto * cmvPctConhecido
    const comissaoEstimada = receitaSemComissao * comissaoPctConhecido
    custo_produto_30 += cmvEstimado
    comissao_30 += comissaoEstimada
    const ticket30 = vendas30 > 0 ? receita30 / vendas30 : 0
    // Lucro = receita - CMV - comissões + bonus_envio - cupom
    // NOTA: custo_flex (R$ 13.90 carrier FLEX) NÃO é subtraído do lucro aqui porque:
    //   - Para FLEX: o payout ML já é "líquido de tudo" (buyer paga carrier direto);
    //     bonus_envio compensa parte do carrier. O CMV (custo_produto_30) pode incluir
    //     o flex ou não dependendo se o sync populou custo_total com ou sem flex.
    //   - Para FULL/cross_docking: o sender_cost (frete real do seller) precisa vir da
    //     API ML shipments/{id}/costs — atualmente está 0 porque o sync LIURA não puxa.
    //     Isso faz o lucro de FULL/cross parecer ~R$ 10/order MAIOR que o real.
    // Fórmula correta por canal (quando tivermos sender_cost correto):
    //   FLEX:       lucro = total - CMV - pct - fixa - bCupom  (+ bEnvio - flex ≈ 0)
    //   FULL/cross: lucro = total - CMV - pct - sender_cost + bEnvio - bCupom
    const lucro30 = receita30 - custo_produto_30 - comissao_30 + bonus_envio_30 - bonus_cupom_30
    const margemPct = receita30 > 0 ? (lucro30 / receita30) * 100 : 0
    const cmvPct = receita30 > 0 ? (custo_produto_30 / receita30) * 100 : 0

    // 2) Histórico 12 meses
    const orders12m = await prisma.orders.findMany({
      where: {
        ...companyFilter,
        created_at: { gte: inicio12m },
        status: { notIn: ['cancelado', 'devolvido'] },
      },
      select: { total: true, created_at: true },
    })
    const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
    const mesesMap: Record<string, { mes: string; ano: number; receita: number; vendas: number }> = {}
    for (let i = 11; i >= 0; i--) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${d.getMonth()}`
      mesesMap[key] = { mes: MESES[d.getMonth()], ano: d.getFullYear(), receita: 0, vendas: 0 }
    }
    for (const o of orders12m) {
      if (!o.created_at) continue
      const d = new Date(o.created_at)
      const key = `${d.getFullYear()}-${d.getMonth()}`
      if (mesesMap[key]) {
        mesesMap[key].receita += Number(o.total)
        mesesMap[key].vendas++
      }
    }
    const meses12 = Object.entries(mesesMap).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => ({ key: k, ...v }))

    // 3) Top 5 produtos 30d
    const topMap: Record<string, { id: string; sku: string; nome: string; foto: string | null; qtd: number; receita: number; custo: number; lucro: number; margem_pct: number }> = {}
    for (const o of orders30) {
      for (const it of o.order_items) {
        if (!it.products) continue
        const k = it.products.id
        if (!topMap[k]) {
          topMap[k] = { id: k, sku: it.products.sku, nome: it.products.nome, foto: it.products.foto_principal_url, qtd: 0, receita: 0, custo: 0, lucro: 0, margem_pct: 0 }
        }
        topMap[k].qtd += it.quantidade
        const receitaItem = Number(it.preco_unitario) * it.quantidade
        const custoItem = Number(it.custo_unitario || 0) * it.quantidade
        topMap[k].receita += receitaItem
        topMap[k].custo += custoItem
        topMap[k].lucro = topMap[k].receita - topMap[k].custo
        topMap[k].margem_pct = topMap[k].receita > 0 ? (topMap[k].lucro / topMap[k].receita) * 100 : 0
      }
    }
    const top5 = Object.values(topMap).sort((a, b) => b.qtd - a.qtd).slice(0, 5)

    // 4) Cancelamentos 30d
    const cancel30 = await prisma.orders.count({
      where: {
        ...companyFilter,
        created_at: { gte: inicio30, lte: fimPeriodo },
        status: { in: ['cancelado', 'devolvido'] },
      },
    })

    // 5) Ads (Mercado Ads) 30d — coluna orders.ads_valor existe no banco real mas não
    // está no schema.prisma (drift), então usa $queryRaw com parâmetro de verdade.
    // Depende do sync manual/periódico de /api/admin/ads-ml — pode estar zerado se
    // ninguém rodou o sync recentemente.
    const companyFilterAds = companyId ? Prisma.sql`AND company_id = ${companyId}::uuid` : Prisma.empty
    const adsRows = await prisma.$queryRaw<{ total: number }[]>`
      SELECT COALESCE(SUM(ads_valor), 0)::float as total
      FROM orders
      WHERE created_at >= ${inicio30}
        AND created_at <= ${fimPeriodo}
        AND status NOT IN ('cancelado', 'devolvido')
        ${companyFilterAds}
    `
    const ads_30d = Number(adsRows[0]?.total || 0)

    // 6) Impostos / custos fixos / custos variáveis — lançamentos reais em monthly_costs
    // (cadastrados manualmente no Financeiro), últimos 30 dias.
    const mesInicioCutoff = inicio30.getMonth() + 1
    const anoInicioCutoff = inicio30.getFullYear()
    const custosMes = await prisma.monthly_costs.findMany({
      where: {
        ...(companyId ? { company_id: companyId } : {}),
        OR: [
          { pago_em: { gte: inicio30 } },
          {
            pago_em: null,
            AND: [
              { ano: { gte: anoInicioCutoff } },
              { OR: [{ ano: { gt: anoInicioCutoff } }, { mes: { gte: mesInicioCutoff } }] },
            ],
          },
        ],
      },
      select: { valor: true, category: { select: { tipo: true } } },
    })
    let custosFixos30 = 0
    let custosVariaveis30 = 0
    let impostos30 = 0
    for (const c of custosMes) {
      const v = Number(c.valor || 0)
      const tipo = (c.category as any)?.tipo
      if (tipo === 'fixo') custosFixos30 += v
      else if (tipo === 'variavel') custosVariaveis30 += v
      else if (tipo === 'imposto') impostos30 += v
    }

    // Lucro real considerando também impostos e custos operacionais cadastrados
    const lucroReal30 = lucro30 - impostos30 - custosFixos30 - custosVariaveis30 - ads_30d
    const margemReal30 = receita30 > 0 ? (lucroReal30 / receita30) * 100 : 0

    // 7) Estoque crítico (0 ou <=5 unidades) — tabela inventory não é multi-tenant
    // (estoque físico é único, compartilhado entre as contas/canais)
    const estoqueCriticoWhere = { OR: [{ quantidade_atual: 0 }, { quantidade_atual: { lte: 5 } }] }
    const estoqueCriticoCount = await prisma.inventory.count({ where: estoqueCriticoWhere })
    const estoqueCriticoItens = await prisma.inventory.findMany({
      where: estoqueCriticoWhere,
      include: { products: { select: { id: true, sku: true, nome: true, foto_principal_url: true } } },
      orderBy: { quantidade_atual: 'asc' },
      take: 5,
    })
    const estoqueCriticoList = estoqueCriticoItens
      .filter(i => i.products)
      .map(i => ({
        product_id: i.products!.id,
        sku: i.products!.sku,
        nome: i.products!.nome,
        foto: i.products!.foto_principal_url,
        quantidade_atual: i.quantidade_atual || 0,
      }))

    // 8) Produtos parados (sem vender há 30+ dias, mas venderam nos últimos 365 dias)
    const produtosParadosRows = await prisma.$queryRaw<any[]>`
      SELECT p.id::text as product_id, p.sku, p.nome, p.foto_principal_url as foto,
             MAX(o.created_at) as ultima_venda,
             COUNT(*)::int as vendas_total
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      JOIN products p ON p.id = oi.product_id
      WHERE o.status NOT IN ('cancelado', 'devolvido')
        AND o.created_at >= NOW() - INTERVAL '365 days'
        ${companyId ? Prisma.sql`AND o.company_id = ${companyId}::uuid` : Prisma.empty}
      GROUP BY p.id, p.sku, p.nome, p.foto_principal_url
      HAVING MAX(o.created_at) < NOW() - INTERVAL '30 days'
      ORDER BY MAX(o.created_at) ASC
      LIMIT 5
    `
    const produtosParados = produtosParadosRows.map(p => ({
      product_id: p.product_id,
      sku: p.sku,
      nome: p.nome,
      foto: p.foto,
      dias_parado: Math.floor((Date.now() - new Date(p.ultima_venda).getTime()) / (24 * 3600 * 1000)),
      vendas_total: p.vendas_total,
    }))

    // 9) Próximas ações — por enquanto, alertas de estoque crítico (o que já existia
    // em gestao-ativa/route.ts, que não estava ligado a nenhuma tela)
    const proximasAcoes = estoqueCriticoList.slice(0, 5).map(p => ({
      tipo: 'estoque',
      titulo: `Estoque crítico: ${p.sku}`,
      subtitulo: `${p.quantidade_atual} em estoque — ${p.nome}`,
      severidade: p.quantidade_atual === 0 ? 'critica' : 'alerta',
      link: `/admin/produtos/${p.product_id}`,
    }))

    // 10) Anúncios ativos / SKUs ativos — mesma definição de "active" que o ML devolve
    // (status='active' em marketplace_listings, já usado em account-stats/route.ts).
    // "SKUs ativos" = produtos distintos com pelo menos 1 anúncio ativo (um produto pode
    // ter vários anúncios — kits, contas diferentes — por isso o número pode ser menor).
    const companyFilterListings = companyId ? Prisma.sql`AND ma.company_id = ${companyId}::uuid` : Prisma.empty
    const listingsAtivosRows = await prisma.$queryRaw<{ anuncios: bigint; skus: bigint }[]>`
      SELECT COUNT(*)::bigint as anuncios, COUNT(DISTINCT ml.product_id)::bigint as skus
      FROM marketplace_listings ml
      JOIN marketplace_accounts ma ON ma.id = ml.account_id
      WHERE ml.status = 'active'
        ${companyFilterListings}
    `
    const anunciosAtivos = Number(listingsAtivosRows[0]?.anuncios ?? 0)
    const skusAtivos = Number(listingsAtivosRows[0]?.skus ?? 0)

    return NextResponse.json({
      success: true,
      data: {
        periodo: {
          dias: periodoDias,
          from: inicio30.toISOString(),
          to: fimPeriodo.toISOString(),
        },
        anuncios_ativos: anunciosAtivos,
        skus_ativos: skusAtivos,
        resumo: {
          receita_30d: Number(receita30.toFixed(2)),
          vendas_30d: vendas30,
          ticket_medio: Number(ticket30.toFixed(2)),
          // CUSTOS REAIS (não % fixa)
          cmv_30d: Number(custo_produto_30.toFixed(2)),
          cmv_pct: Number(cmvPct.toFixed(1)),
          // Cobertura de dados de custo (pra frontend mostrar alerta se estimado)
          cmv_real: Number(cmvCustoReal.toFixed(2)),
          cmv_estimado: Number(cmvEstimado.toFixed(2)),
          receita_com_custo_real: Number(receitaComCustoReal.toFixed(2)),
          receita_sem_custo: Number(receitaSemCusto.toFixed(2)),
          cmv_pct_conhecido: Number((cmvPctConhecido * 100).toFixed(1)),
          // Comissão ML (tarifa_pct + tarifa_fixa, SEM cupom)
          comissao_30d: Number(comissao_30.toFixed(2)),
          comissao_pct_conhecido: Number((comissaoPctConhecido * 100).toFixed(1)),
          receita_sem_comissao: Number(receitaSemComissao.toFixed(2)),
          tarifa_pct_30d: Number(tarifa_pct_30.toFixed(2)),
          tarifa_fixa_30d: Number(tarifa_fixa_30.toFixed(2)),
          frete_30d: Number(frete_30.toFixed(2)),
          custo_flex_30d: Number(custo_flex_30.toFixed(2)),
          // Bônus (afetam o recebimento, mas não são receita)
          bonus_envio_30d: Number(bonus_envio_30.toFixed(2)),
          bonus_cupom_30d: Number(bonus_cupom_30.toFixed(2)),
          // O que ML paga ao seller (líquido) — apenas orders que têm dado preenchido
          recebimento_30d: Number(recebimento_30.toFixed(2)),
          // LUCRO BRUTO: receita - CMV - comissões - flex + bonus_envio - cupom
          lucro_30d: Number(lucro30.toFixed(2)),
          margem_pct: Number(margemPct.toFixed(1)),
          cancelamentos_30d: cancel30,
          // NOVO — Deduções adicionais (pro card "Composição"/"Deduções")
          impostos_30d: Number(impostos30.toFixed(2)),
          custos_fixos_30d: Number(custosFixos30.toFixed(2)),
          custos_variaveis_30d: Number(custosVariaveis30.toFixed(2)),
          ads_30d: Number(ads_30d.toFixed(2)),
          lucro_real_30d: Number(lucroReal30.toFixed(2)),
          margem_real_pct: Number(margemReal30.toFixed(1)),
        },
        meses_6: meses12,
        top_produtos: top5,
        estoque_critico: { count: estoqueCriticoCount, items: estoqueCriticoList },
        produtos_parados: { count: produtosParados.length, items: produtosParados },
        proximas_acoes: proximasAcoes,
      },
    })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}
