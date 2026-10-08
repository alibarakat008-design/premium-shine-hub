import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * GET /api/admin/vendas-recentes
 * Retorna orders recentes com cálculo completo:
 *   - venda (total)
 *   - comissão ML (14% se FULL, 13% se clássico — heurística simples)
 *   - frete (total do order_detail.shipping)
 *   - recebimento = venda - comissão - frete
 *   - custo = soma de product_prices.custo * quantidade
 *   - margem (R$) = recebimento - custo
 *   - margem (%) = margem / recebimento
 *
 * Query params:
 *   - limit (default 50, max 200)
 *   - hours (default 24, opcional filtro de janela)
 *   - company_id (opcional)
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const limit = Math.min(Number(searchParams.get('limit') || 50), 200)
    const hours = Number(searchParams.get('hours') || 720) // 30 dias por padrão
    const day = searchParams.get('day') // 'today' = dia BRT (00:00 BRT - agora)
    const accountIdParam = searchParams.get('account_id')
    let companyId = searchParams.get('company_id')

    // PRIVACIDADE multi-tenant: filtra automaticamente por company
    // Prioridade:
    //  1. ?company_id= (admin forçando)
    //  2. psh_active_company (matriz pode trocar)
    //  3. psh_session_company (parceiro só vê a dele)
    const cookieActive = req.cookies.get('psh_active_company')?.value
    const cookieSession = req.cookies.get('psh_session_company')?.value
    const sessionRole = req.cookies.get('psh_session_role')?.value
    const isMatriz = !sessionRole || sessionRole === 'matriz'

    if (!companyId) {
      if (cookieActive) {
        companyId = cookieActive
      } else if (cookieSession && !isMatriz) {
        // Parceiro sem active_company: força o filtro pra session_company
        companyId = cookieSession
      }
      // Se for matriz sem active_company, vê TUDO (null)
    }

    // Se veio ?account_id=, converte pra company_id (account_id → company via marketplace_accounts)
    // Isso permite o painel passar a conta ML diretamente sem saber o company_id
    if (accountIdParam && !companyId) {
      try {
        const acc: any = await prisma.marketplace_accounts.findUnique({
          where: { id: accountIdParam },
          select: { company_id: true },
        })
        if (acc?.company_id) companyId = acc.company_id
      } catch {}
    }

    const origem = searchParams.get('origem') || 'todos' // 'todos' | 'mercado_livre' | 'shopee' | 'site_b2c' | etc

    // day=today → usa janela BRT (00:00 - agora) que bate com painel ML oficial
    let since: Date
    if (day === 'today') {
      const agora = new Date()
      const dataBRT = agora.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
      since = new Date(`${dataBRT}T00:00:00-03:00`)
    } else {
      since = new Date(Date.now() - hours * 3600 * 1000)
    }

    const where: any = {
      // Filtrar por pago_em (data real do pedido) com fallback em created_at
      OR: [
        { pago_em: { gte: since } },
        { AND: [{ pago_em: null }, { created_at: { gte: since } }] },
      ],
    }
    if (companyId) where.company_id = companyId
    if (origem !== 'todos') {
      // Filtra por origem (mercado_livre, shopee, site_b2c, b2b, whatsapp, varejo, manual etc)
      where.origem = origem
    }

    const orders = await prisma.orders.findMany({
      where,
      orderBy: { created_at: 'desc' },
      take: limit,
      select: {
        id: true,
        order_number: true,
        total: true,
        subtotal: true,
        status: true,
        created_at: true,
        origem: true,
        marketplace_account_id: true,
        // Campos REAIS do ML (salvos pelo backfill-ml-commissions)
        comissao_seller_pct: true,
        comissao_seller_valor: true,
        frete: true,
        recebimento_liquido: true,
        desconto: true,
        // Tipo de envio REAL da venda (vem do /shipments/{id})
        // 'fulfillment' = FULL, 'self_service' = FLEX, 'me2'/'me1' = Mercado Envios
        tipo_envio: true,
        custo_flex: true,
        // pack_id do ML (número que aparece na listagem principal do painel ML)
        pack_id: true,
        // Controle de fulfillment interno (bolinha colorida)
        // (Prisma ainda não conhece essas colunas — usamos `as any` no select abaixo)
        // Decomposição da comissão ML
        bonus_envio_valor: true,
        bonus_cupom_valor: true,
        tarifa_pct_valor: true,
        tarifa_fixa_valor: true,
        total_paid_amount: true,
        order_items: {
          include: {
            products: {
              include: {
                product_prices: {
                  where: { canal: 'mercado_livre' },
                  take: 1,
                },
                marketplace_listings: {
                  select: { envio_full: true },
                  take: 1,
                },
              },
            },
          },
        },
        marketplace_accounts: {
          select: {
            id: true,
            nickname: true,
            plataforma: true,
          },
        },
      },
    })

    // Busca separada das colunas de fulfillment (Prisma ainda não conhece — schema migrations pendentes)
    const orderIds = orders.map(o => o.id)
    let fulfillmentMap = new Map<string, { etiqueta_impressa_em: string | null; embalado_em: string | null }>()
    if (orderIds.length > 0) {
      try {
        const fulfillmentRows: any[] = await prisma.$queryRawUnsafe(`
          SELECT id::text AS id, etiqueta_impressa_em, embalado_em
          FROM orders WHERE id = ANY($1::uuid[])
        `, orderIds)
        for (const r of fulfillmentRows) {
          fulfillmentMap.set(r.id, {
            etiqueta_impressa_em: r.etiqueta_impressa_em,
            embalado_em: r.embalado_em,
          })
        }
      } catch (e) {
        // Colunas ainda não migradas — segue sem fulfillment
      }
    }

    // Calcular
    const result = orders.map((o) => {
      const venda = Number(o.total || 0)
      const subtotal = Number(o.subtotal || 0)

      // Tipo de envio: prioriza o tipo_envio REAL da venda (vem do /shipments/{id}).
      // Fallback: detecta pelo listing do item (envio_full → Full, listing_type → Agência)
      const tipoEnvioReal = o.tipo_envio || null
      let tipoML: 'classico' | 'agencia' | 'full' | 'flex' = 'classico'
      let isFull = false
      let isFlex = false
      if (tipoEnvioReal === 'fulfillment') {
        tipoML = 'full'
        isFull = true
      } else if (tipoEnvioReal === 'self_service') {
        tipoML = 'flex'
        isFlex = true
      } else {
        // Fallback pelo listing (orders antigas sem tipo_envio preenchido)
        for (const it of o.order_items || []) {
          const lst = (it.products as any)?.marketplace_listings?.[0]
          if (lst?.envio_full) { tipoML = 'full'; isFull = true; break }
          const lt = lst?.listing_type
          if (lt === 'gold_pro' || lt === 'gold_special') tipoML = 'agencia'
        }
      }
      // Decomposição da comissão ML (vinda do sync/backfill)
      const tarifaPctValor = o.tarifa_pct_valor != null ? Number(o.tarifa_pct_valor) : Math.round(venda * 0.12 * 100) / 100
      const tarifaFixaValor = o.tarifa_fixa_valor != null ? Number(o.tarifa_fixa_valor) : 0
      const bonusCupomValor = o.bonus_cupom_valor != null ? Number(o.bonus_cupom_valor) : 0
      const bonusEnvioValor = o.bonus_envio_valor != null ? Number(o.bonus_envio_valor) : 0
      const totalPaidAmount = o.total_paid_amount != null ? Number(o.total_paid_amount) : null
      // PROXY de bonus_envio: diferença entre total_paid (buyer) e total (produto)
      // Funciona quando o buyer pagou MAIS (cupom) ou MENOS (desconto ML)
      let bonusEnvioEstimado = 0
      if (totalPaidAmount != null && totalPaidAmount > venda) {
        bonusEnvioEstimado = totalPaidAmount - venda
      }
      // Tarifa bruta ML = pct + fixa (custo que o seller teria sem estornos)
      const tarifaBrutaML = tarifaPctValor + tarifaFixaValor
      // Total estornos = cupom + envio (com fallback pro proxy)
      const totalEstornos = bonusCupomValor + Math.max(bonusEnvioValor, bonusEnvioEstimado)
      // ML paga = venda - tarifa_bruta + estornos (= o que aparece no painel "Total")
      const recebimentoMLPaga = venda - tarifaBrutaML + totalEstornos
      const taxaComissao = 0.12 // todas 12% em jun/2026
      // Prioriza comissão REAL salva no banco (vinda do backfill do ML)
      const comissaoRealSalva = o.comissao_seller_valor != null ? Number(o.comissao_seller_valor) : null
      const comissao = comissaoRealSalva ?? (subtotal * taxaComissao)
      const taxaExibida = comissaoRealSalva != null
        ? Number(o.comissao_seller_pct || 0)
        : taxaComissao * 100

      // FRETE: comportamento diferente por tipo
      // - FLEX: ML NÃO desconta frete (vendedor paga carrier à parte)
      //   frete = 0 (o custo real vai pro custo_flex)
      // - FULL / ME1 / ME2: ML desconta frete normalmente
      const freteMLSalvo = o.frete != null ? Number(o.frete) : 0
      const frete = isFlex ? 0 : freteMLSalvo

      // Custo FLEX: vem do shipment.base_cost (salvo em orders.custo_flex pelo sync).
      // Se não tiver (backfill antigo), assume R$13,90 como fallback.
      const custoFlexPadrao = 13.9
      const custoFlex = o.custo_flex != null ? Number(o.custo_flex) : (isFlex ? custoFlexPadrao : 0)

      // Bônus/cupom (campanha comercial ML — soma na margem)
      const bonus = o.desconto != null ? Number(o.desconto) : 0

      // Recebimento: prioriza o REAL do ML (salvo pelo backfill), senão calcula simples.
      // (Não desconta custo Flex aqui — vai pro CMV separado.)
      const recebimento = o.recebimento_liquido != null
        ? Number(o.recebimento_liquido)
        : venda - comissao - freteMLSalvo

      // Custo do PRODUTO (sem custo_flex) - vai como custoProduto pra cálculo interno.
      // Prioriza custo do próprio item (custo_unitario direto), fallback pro product_prices via JOIN.
      let custoProduto = 0
      for (const it of o.order_items || []) {
        const qty = it.quantidade || 1
        // 1) custo direto do item (vem do sync ML / propagado por sync-custo-items)
        const custoItem = it.custo_unitario != null ? Number(it.custo_unitario) : 0
        if (custoItem > 0) {
          custoProduto += custoItem * qty
          continue
        }
        // 2) fallback: product_prices via products (só se item tiver product_id linkado)
        const p = it.products
        if (p) {
          const price = p.product_prices?.[0]
          if (price?.custo) {
            custoProduto += Number(price.custo) * qty
          }
        }
      }
      // CMV total = custo do produto + custo_flex (FLEX) — vai pra coluna "Custo" do painel
      // e pra cálculo da margem. Assim o painel mostra 75 + 13,90 = 88,90 como esperado.
      let custo = custoProduto + (isFlex ? custoFlex : 0)

      // Vendas CANCELADAS ou DEVOLVIDAS: custo/lucro zeram pra não poluir KPIs financeiros.
      // A venda continua visível na lista (com cor diferente), mas não conta no resumo.
      // ⚠️ Multi-tenant-safe: o status da venda pode estar desatualizado (sync só pega 'paid' na importação).
      // O backfill-status (Opção B) corrige isso. Até lá, ficamos com a regra: SE status já tá cancelado/devolvido,
      // JÁ exclui. Se ainda não foi sincronizado, conta normalmente (não temos como saber melhor sem refetch).
      const statusNormalizado = String(o.status || '').toLowerCase().trim()
      const isCanceladaOuDevolvida = ['cancelado', 'cancelada', 'devolvido', 'devolvida', 'cancelled', 'refunded'].includes(statusNormalizado)
      const excluirDoCalculo = isCanceladaOuDevolvida

      // Se exclui, zera custo/lucro/margem (mas mantém venda visível)
      let margemReais = recebimento - custo
      let margemPct = recebimento > 0 ? (margemReais / recebimento) * 100 : 0
      if (excluirDoCalculo) {
        custo = 0
        margemReais = 0
        margemPct = 0
      }

      // Pega primeiro item (nome + sku) — tenta primeiro o campo próprio do order_items,
      // depois cai pro products, depois tenta concatenar todos os items
      const firstItem = o.order_items?.[0]
      const itemCount = o.order_items?.length || 0
      const produto =
        firstItem?.nome_produto ||
        firstItem?.products?.nome ||
        (itemCount > 1 ? `${itemCount} produtos` : '—')
      const sku =
        firstItem?.sku ||
        firstItem?.products?.sku ||
        '—'
      // Quantidade: soma de todos os items. Se vier 0 mas tem item, força 1
      const qtdSoma = o.order_items?.reduce((s, i) => s + (i.quantidade || 0), 0) || 0
      const quantidade = qtdSoma > 0 ? qtdSoma : (itemCount > 0 ? 1 : 0)

      return {
        id: o.id,
        order_number: o.order_number,
        pack_id: o.pack_id, // número do ML (igual ao do painel)
        // pack_id é o número PRINCIPAL do ML quando a venda é pack_order
        // order_number é o id único da venda individual
        created_at: o.created_at,
        status: o.status,
        plataforma: (o.marketplace_accounts as any)?.plataforma || 'mercado_livre',
        conta: (o.marketplace_accounts as any)?.nickname || '—',
        produto,
        sku,
        quantidade,
        venda: Number(venda.toFixed(2)),
        comissao: Number(comissao.toFixed(2)),
        taxa_comissao_pct: Number(taxaExibida.toFixed(2)),
        frete: Number(frete.toFixed(2)),
        custo_flex: isFlex ? custoFlex : 0,
        // Decomposição detalhada da comissão (igual aparece no painel do ML)
        tarifa_pct_valor: Number(tarifaPctValor.toFixed(2)),     // 12% cheio
        tarifa_fixa_valor: Number(tarifaFixaValor.toFixed(2)),   // custo fixo ML
        tarifa_bruta_ml: Number(tarifaBrutaML.toFixed(2)),       // pct + fixa
        bonus_cupom: Number(bonusCupomValor.toFixed(2)),         // descontos e bônus
        bonus_envio: Number(bonusEnvioValor.toFixed(2)),         // bônus por envio
        bonus_envio_estimado: Number(bonusEnvioEstimado.toFixed(2)), // proxy via total_paid
        total_estornos: Number(totalEstornos.toFixed(2)),        // cupom + envio
        total_paid_amount: totalPaidAmount != null ? Number(totalPaidAmount.toFixed(2)) : null,
        bonus: Number(bonus.toFixed(2)),                         // total bônus
        ml_paga: Number(recebimentoMLPaga.toFixed(2)),           // = venda - tarifa_bruta + estornos
        recebimento: Number(recebimento.toFixed(2)),
        custo: Number(custo.toFixed(2)),
        margem_reais: Number(margemReais.toFixed(2)),
        margem_pct: Number(margemPct.toFixed(1)),
        isFull,
        isFlex,
        tipo_ml: tipoML,
        tipo_envio: tipoEnvioReal,
        excluir_do_calculo: excluirDoCalculo,
        // Controle de fulfillment interno (bolinha) — vem do fulfillmentMap
        etiqueta_impressa_em: fulfillmentMap.get(o.id)?.etiqueta_impressa_em || null,
        embalado_em: fulfillmentMap.get(o.id)?.embalado_em || null,
        // Etapa calculada: 'pendente' | 'impresso' | 'embalado' | 'enviado' | 'entregue' | 'cancelado'
        // Auto: status ML já é fonte da verdade. Manual: clicar na bolinha avança.
        etapa_fulfillment: (() => {
          const st = String(o.status || '').toLowerCase()
          if (['cancelado', 'cancelada', 'cancelled', 'devolvido', 'devolvida', 'refunded'].includes(st)) return 'cancelado'
          if (st === 'entregue' || st === 'delivered') return 'entregue'
          if (st === 'enviado' || st === 'shipped') return 'enviado'
          const ff = fulfillmentMap.get(o.id)
          if (ff?.embalado_em) return 'embalado'
          if (ff?.etiqueta_impressa_em) return 'impresso'
          return 'pendente'
        })(),
      }
    })

    // Resumo — SOMA SÓ VENDAS VÁLIDAS (exclui canceladas/devolvidas)
    const vendasValidas = result.filter(r => !r.excluir_do_calculo)
    const vendasExcluidas = result.filter(r => r.excluir_do_calculo)

    // ⚡ Query agregada SQL CRUA — calcula o resumo do PERÍODO INTEIRO (sem limit)
    // pra refletir TODAS as vendas, não só as 200/300 mostradas na lista
    const statusInvalidos = ['cancelado', 'cancelada', 'devolvido', 'devolvida', 'cancelled', 'refunded']

    // Constrói WHERE SQL a partir do `where` Prisma
    const sqlParams: any[] = []
    const sqlWhere: string[] = []
    if (where.company_id) {
      sqlWhere.push(`company_id = $${sqlParams.length + 1}::uuid`)
      sqlParams.push(where.company_id)
    }
    if (where.origem && where.origem !== 'todos') {
      sqlWhere.push(`origem = $${sqlParams.length + 1}::order_origem`)
      sqlParams.push(where.origem)
    }
    if (where.OR && Array.isArray(where.OR)) {
      const orParts: string[] = []
      for (const branch of where.OR) {
        if (branch.pago_em?.gte) {
          orParts.push(`pago_em >= $${sqlParams.length + 1}::timestamptz`)
          sqlParams.push(branch.pago_em.gte)
        }
        if (branch.AND) {
          for (const sub of branch.AND) {
            if (sub.created_at?.gte) {
              orParts.push(`(pago_em IS NULL AND created_at >= $${sqlParams.length + 1}::timestamptz)`)
              sqlParams.push(sub.created_at.gte)
            }
          }
        }
      }
      if (orParts.length) sqlWhere.push(`(${orParts.join(' OR ')})`)
    }
    const sqlWhereStr = sqlWhere.length ? `WHERE ${sqlWhere.join(' AND ')}` : ''

    // 1) Resumo do PERÍODO INTEIRO (válidas + canceladas + totais)
    // FÓRMULA CANÔNICA (validada):
    //   comissao = tarifa_pct + tarifa_fixa (pura ML, sem cupom)
    //   custo = custo_total (CMV puro, SEM custo_flex)
    //   custo_flex = separado (carrier FLEX R$ 13.90)
    //   bonus_envio / bonus_cupom = opcionais (afetam recebimento)
    //   margem = recebimento - custo - custo_flex
    const sqlResumo: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        COUNT(*)::int as total_geral,
        COUNT(*) FILTER (
          WHERE status IS NULL
             OR (LOWER(status::text) NOT IN ('cancelado','cancelada','cancelled','devolvido','devolvida','refunded'))
        )::int as total_validas,
        COUNT(*) FILTER (
          WHERE LOWER(status::text) IN ('cancelado','cancelada','cancelled','devolvido','devolvida','refunded')
        )::int as total_excluidas,
        COALESCE(SUM(total) FILTER (
          WHERE status IS NULL
             OR (LOWER(status::text) NOT IN ('cancelado','cancelada','cancelled','devolvido','devolvida','refunded'))
        ), 0)::numeric as venda,
        COALESCE(SUM(COALESCE(tarifa_pct_valor, 0) + COALESCE(tarifa_fixa_valor, 0)) FILTER (
          WHERE status IS NULL
             OR (LOWER(status::text) NOT IN ('cancelado','cancelada','cancelled','devolvido','devolvida','refunded'))
        ), 0)::numeric as comissao,
        COALESCE(SUM(COALESCE(tarifa_pct_valor, 0)) FILTER (
          WHERE status IS NULL
             OR (LOWER(status::text) NOT IN ('cancelado','cancelada','cancelled','devolvido','devolvida','refunded'))
        ), 0)::numeric as tarifa_pct,
        COALESCE(SUM(COALESCE(tarifa_fixa_valor, 0)) FILTER (
          WHERE status IS NULL
             OR (LOWER(status::text) NOT IN ('cancelado','cancelada','cancelled','devolvido','devolvida','refunded'))
        ), 0)::numeric as tarifa_fixa,
        COALESCE(SUM(COALESCE(bonus_envio_valor, 0)) FILTER (
          WHERE status IS NULL
             OR (LOWER(status::text) NOT IN ('cancelado','cancelada','cancelled','devolvido','devolvida','refunded'))
        ), 0)::numeric as bonus_envio,
        COALESCE(SUM(COALESCE(bonus_cupom_valor, 0)) FILTER (
          WHERE status IS NULL
             OR (LOWER(status::text) NOT IN ('cancelado','cancelada','cancelled','devolvido','devolvida','refunded'))
        ), 0)::numeric as bonus_cupom,
        COALESCE(SUM(COALESCE(frete, 0)) FILTER (
          WHERE status IS NULL
             OR (LOWER(status::text) NOT IN ('cancelado','cancelada','cancelled','devolvido','devolvida','refunded'))
        ), 0)::numeric as frete,
        COALESCE(SUM(recebimento_liquido) FILTER (
          WHERE status IS NULL
             OR (LOWER(status::text) NOT IN ('cancelado','cancelada','cancelled','devolvido','devolvida','refunded'))
        ), 0)::numeric as recebimento,
        COALESCE(SUM(COALESCE(custo_total, 0)) FILTER (
          WHERE status IS NULL
             OR (LOWER(status::text) NOT IN ('cancelado','cancelada','cancelled','devolvido','devolvida','refunded'))
        ), 0)::numeric as custo,
        COALESCE(SUM(COALESCE(custo_flex, 0)) FILTER (
          WHERE status IS NULL
             OR (LOWER(status::text) NOT IN ('cancelado','cancelada','cancelled','devolvido','devolvida','refunded'))
        ), 0)::numeric as custo_flex
      FROM orders
      ${sqlWhereStr}
    `, ...sqlParams)

    const r = sqlResumo[0] || {
      total_geral: 0, total_validas: 0, total_excluidas: 0,
      venda: 0, comissao: 0, tarifa_pct: 0, tarifa_fixa: 0,
      bonus_envio: 0, bonus_cupom: 0, frete: 0,
      recebimento: 0, custo: 0, custo_flex: 0,
    }
    const totalValidas = Number(r.total_validas)
    const totalExcluidas = Number(r.total_excluidas)
    const totalGeral = Number(r.total_geral)
    const totalVenda = Number(r.venda)
    const totalComissao = Number(r.comissao)
    const totalTarifaPct = Number(r.tarifa_pct)
    const totalTarifaFixa = Number(r.tarifa_fixa)
    const totalBonusEnvio = Number(r.bonus_envio)
    const totalBonusCupom = Number(r.bonus_cupom)
    const totalFrete = Number(r.frete)
    const totalRecebimento = Number(r.recebimento)
    const totalCusto = Number(r.custo)            // CMV puro
    const totalCustoFlex = Number(r.custo_flex)   // carrier FLEX
    // Lucro canônico: recebimento - custo (CMV) - custo_flex
    const totalMargem = totalRecebimento - totalCusto - totalCustoFlex
    const margemPct = totalRecebimento > 0 ? (totalMargem / totalRecebimento) * 100 : 0

    return NextResponse.json({
      ok: true,
      total: totalGeral, // Total de vendas NO PERÍODO (sem limit)
      total_listadas: result.length, // Quantas vendas retornaram na lista (limitadas)
      total_validas: totalValidas,
      total_excluidas: totalExcluidas,
      resumo: {
        venda: Number(totalVenda.toFixed(2)),
        comissao: Number(totalComissao.toFixed(2)),
        tarifa_pct: Number(totalTarifaPct.toFixed(2)),
        tarifa_fixa: Number(totalTarifaFixa.toFixed(2)),
        bonus_envio: Number(totalBonusEnvio.toFixed(2)),
        bonus_cupom: Number(totalBonusCupom.toFixed(2)),
        frete: Number(totalFrete.toFixed(2)),
        recebimento: Number(totalRecebimento.toFixed(2)),
        custo: Number(totalCusto.toFixed(2)),
        custo_flex: Number(totalCustoFlex.toFixed(2)),
        margem_reais: Number(totalMargem.toFixed(2)),
        margem_pct: Number(margemPct.toFixed(1)),
      },
      vendas: result,
    })
  } catch (err: any) {
    console.error('vendas-recentes error:', err)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
