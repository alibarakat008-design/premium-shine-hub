// GET /api/admin/notifications
// Retorna notificações/alertas do sistema:
// - Estoque crítico (produto com estoque_atual <= estoque_minimo)
// - Token ML expirado (vai expirar em < 7 dias)
// - Vendas caindo (> 30% queda)
// - Produtos com vendas crescendo (> 50% alta)
// - Custos não cadastrados (custo = 0 ou null no canal mercado_livre)

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    const notificacoes: any[] = []

    // 1) Estoque crítico (top 5)
    const estoqueCritico = await prisma.inventory.findMany({
      where: {
        OR: [
          { quantidade_atual: 0 },
          { quantidade_atual: { lte: 5 } },
        ],
      },
      include: {
        products: { select: { id: true, sku: true, nome: true, foto_principal_url: true } },
      },
      take: 5,
    })
    for (const inv of estoqueCritico) {
      if (!inv.products) continue
      notificacoes.push({
        id: `estoque-${inv.id}`,
        tipo: inv.quantidade_atual === 0 ? 'critica' : 'atencao',
        emoji: inv.quantidade_atual === 0 ? '🚨' : '⚠️',
        titulo: inv.quantidade_atual === 0 ? `${inv.products.sku} sem estoque!` : `${inv.products.sku} estoque baixo`,
        subtitulo: `${inv.products.nome.substring(0, 60)} • ${inv.quantidade_atual || 0} un em estoque`,
        link: `/admin/produtos`,
        criado_em: new Date().toISOString(),
      })
    }

    // 2) Token ML
    const acc = await prisma.marketplace_accounts.findFirst({
      where: { nickname: 'LIURAESSENCE' },
    })
    if (acc?.token_expira_em) {
      const expira = new Date(acc.token_expira_em)
      const horasRestantes = (expira.getTime() - Date.now()) / 3600000
      if (horasRestantes < 24) {
        notificacoes.push({
          id: 'token-ml-expirado',
          tipo: horasRestantes < 0 ? 'critica' : 'atencao',
          emoji: '🔑',
          titulo: horasRestantes < 0 ? 'Token ML expirado!' : 'Token ML expira em breve',
          subtitulo: horasRestantes < 0
            ? 'A sincronização com Mercado Livre está parada. Renove o token.'
            : `Expira em ${Math.round(horasRestantes)}h. Renove em Configurações.`,
          link: '/admin/configuracoes',
          criado_em: new Date().toISOString(),
        })
      }
    }

    // 3) Produtos sem custo cadastrado
    const semCusto = await prisma.products.count({
      where: {
        ativo: true,
        product_prices: { some: { canal: 'mercado_livre', OR: [{ custo: null }, { custo: 0 }] } },
      },
    })
    if (semCusto > 0) {
      notificacoes.push({
        id: 'sem-custo',
        tipo: 'info',
        emoji: '💰',
        titulo: `${semCusto} produtos sem custo cadastrado`,
        subtitulo: 'A DRE não está calculando CMV corretamente. Vá em Produtos → Custos.',
        link: '/admin/produtos/custos',
        criado_em: new Date().toISOString(),
      })
    }

    // 4) Vendas hoje vs ontem
    const hoje = new Date()
    const inicioHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())
    const inicioOntem = new Date(inicioHoje.getTime() - 24 * 3600 * 1000)

    const vendasHoje = await prisma.orders.count({
      where: { created_at: { gte: inicioHoje }, status: { notIn: ['cancelado', 'devolvido'] } },
    })
    const vendasOntem = await prisma.orders.count({
      where: { created_at: { gte: inicioOntem, lt: inicioHoje }, status: { notIn: ['cancelado', 'devolvido'] } },
    })

    if (vendasOntem > 0 && vendasHoje > vendasOntem * 1.5) {
      notificacoes.push({
        id: 'vendas-subindo',
        tipo: 'sucesso',
        emoji: '🚀',
        titulo: `Vendas ${Math.round((vendasHoje / vendasOntem) * 100 - 100)}% acima de ontem!`,
        subtitulo: `Hoje: ${vendasHoje} vendas • Ontem: ${vendasOntem} vendas. Aproveita o momento!`,
        link: '/admin/vendas-ao-vivo',
        criado_em: new Date().toISOString(),
      })
    } else if (vendasOntem > 0 && vendasHoje < vendasOntem * 0.5) {
      notificacoes.push({
        id: 'vendas-caindo',
        tipo: 'atencao',
        emoji: '📉',
        titulo: `Vendas ${Math.round((1 - vendasHoje / vendasOntem) * 100)}% abaixo de ontem`,
        subtitulo: `Hoje: ${vendasHoje} vendas • Ontem: ${vendasOntem} vendas. Verifique.`,
        link: '/admin/vendas-ao-vivo',
        criado_em: new Date().toISOString(),
      })
    }

    // 5) Custos do mês atual
    const now = new Date()
    const custosMes = await (prisma as any).monthly_costs.count({
      where: { ano: now.getFullYear(), mes: now.getMonth() + 1 },
    })
    if (custosMes === 0) {
      notificacoes.push({
        id: 'sem-custos-mes',
        tipo: 'info',
        emoji: '📊',
        titulo: 'Custos fixos do mês ainda não cadastrados',
        subtitulo: 'A DRE vai mostrar lucro superestimado sem os custos reais.',
        link: '/admin/financeiro/dre-mensal',
        criado_em: new Date().toISOString(),
      })
    }

    // Ordena: crítica > atenção > sucesso > info
    const ordem: any = { critica: 0, atencao: 1, sucesso: 2, info: 3 }
    notificacoes.sort((a, b) => (ordem[a.tipo] ?? 99) - (ordem[b.tipo] ?? 99))

    const counts = {
      total: notificacoes.length,
      critica: notificacoes.filter((n) => n.tipo === 'critica').length,
      atencao: notificacoes.filter((n) => n.tipo === 'atencao').length,
    }

    return NextResponse.json({ ok: true, notificacoes, counts })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
