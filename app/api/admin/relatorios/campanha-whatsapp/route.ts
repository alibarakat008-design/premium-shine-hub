// GET /api/admin/relatorios/campanha-whatsapp?segment=risco&template=reativacao&max=200
// POST /api/admin/relatorios/campanha-whatsapp (gera export CSV)
// Templates:
//   - reativacao: pra clientes em risco
//   - novoproduto: pra clientes ativos
//   - cupom: desconto agressivo
//   - personalizado: usa recomendador

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const TEMPLATES: any = {
  reativacao: {
    label: '🔄 Reativação (clientes sumidos)',
    emoji: '🔄',
    mensagem: (c: any) => `Oi ${c.nome?.split(' ')[0] || 'tudo bem'}! 💜

Faz tempo que a gente não se vê por aqui! Tô sentindo sua falta 😊

Que tal aproveitar uma condição especial? Fiz um cupom exclusivo pra você:

🎁 *CUPOM VOLTEI20* = 20% OFF em qualquer produto

Válido por 7 dias. É só clicar e usar! 💜

https://www.mercadolivre.com.br/`,
  },
  novoproduto: {
    label: '✨ Lançamento de produto',
    emoji: '✨',
    mensagem: (c: any) => `Oi ${c.nome?.split(' ')[0] || 'tudo bem'}! 💜

Acabou de chegar uma novidade que tenho certeza que você vai amar:

🌟 *${c.recomendacao_top || 'Novidades'}* — acabou de chegar!

Como você já é cliente VIP, aviso primeiro que todo mundo 😍

https://www.mercadolivre.com.br/`,
  },
  cupom: {
    label: '🎁 Cupom de desconto',
    emoji: '🎁',
    mensagem: (c: any) => `Oi ${c.nome?.split(' ')[0] || 'tudo bem'}! 💜

Preparei um presente pra você:

🎁 *CUPOM ESPECIAL${c.cupom || '15'}* = ${c.desconto || 15}% OFF

Vale em qualquer produto da loja. Aproveite! ⏰

https://www.mercadolivre.com.br/`,
  },
  personalizado: {
    label: '🎯 Recomendação personalizada',
    emoji: '🎯',
    mensagem: (c: any) => `Oi ${c.nome?.split(' ')[0] || 'tudo bem'}! 💜

Lembro que você curtiu ${c.ultimo_produto || 'nossos produtos'}! 

Pensando em você, separei uma recomendação especial: *${c.recomendacao_top || 'uma novidade'}* — que combina muito com seu perfil 😊

Dá uma olhadinha: https://www.mercadolivre.com.br/`,
  },
  carrinho_abandonado: {
    label: '🛒 Carrinho abandonado',
    emoji: '🛒',
    mensagem: (c: any) => `Oi ${c.nome?.split(' ')[0] || 'tudo bem'}! 💜

Vi que você tava olhando uns produtos e não finalizou. Aconteceu algo? Posso te ajudar 😊

Aproveita 10% OFF com o cupom *VOLTA10*! ⏰

https://www.mercadolivre.com.br/`,
  },
  aniversario: {
    label: '🎂 Aniversário',
    emoji: '🎂',
    mensagem: (c: any) => `PARABÉNS ${c.nome?.split(' ')[0] || ''}! 🎂🎉

Tô passando pra desejar um dia incrível! E pra celebrar, separei um presente:

🎁 *CUPOM NIVER${c.desconto || 25}* = ${c.desconto || 25}% OFF

Vale em qualquer produto. Com amor, equipe Premium Shine 💜`,
  },
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const segment = searchParams.get('segment') || 'risco'
    const template = searchParams.get('template') || 'reativacao'
    const max = Math.min(Number(searchParams.get('max') || 100), 1000)
    const search = searchParams.get('search')?.toLowerCase() || ''

    const tmpl = TEMPLATES[template] || TEMPLATES.reativacao

    // Calcula dias por segmento
    const hoje = new Date()
    const trintaDias = new Date(hoje.getTime() - 30 * 86400000)
    const sessentaDias = new Date(hoje.getTime() - 60 * 86400000)
    const noventaDias = new Date(hoje.getTime() - 90 * 86400000)

    const whereSegment: any = { orders: { some: {} } }
    if (segment === 'ativo') whereSegment.orders.some.created_at = { gte: trintaDias }
    else if (segment === 'risco') {
      whereSegment.orders.some.created_at = { gte: sessentaDias, lt: trintaDias }
    } else if (segment === 'churn') {
      whereSegment.orders.some.created_at = { gte: novaData(90), lt: sessentaDias }
    } else if (segment === 'dormindo') {
      whereSegment.orders.some.created_at = { gte: novaData(180), lt: novaData(90) }
    } else if (segment === 'vip') {
      // VIP: top 20% por receita
      // Simplificado: clientes com mais de 3 pedidos
      whereSegment.orders = { some: {} }
    }

    function novaData(d: number) { return new Date(hoje.getTime() - d * 86400000) }

    const customers = await prisma.customers.findMany({
      where: whereSegment,
      select: {
        id: true,
        nome: true,
        email: true,
        telefone: true,
        orders: {
          where: { status: { not: 'cancelado' } },
          orderBy: { created_at: 'desc' },
          take: 5,
          select: {
            id: true,
            total: true,
            created_at: true,
            order_items: {
              take: 5,
              select: {
                products: { select: { sku: true, nome: true, brands: { select: { nome: true } } } },
              },
            },
          },
        },
      },
      take: max,
    })

    // Calcula last_product, last_brand
    type Dest = {
      id: string
      nome: string
      email: string | null
      telefone: string | null
      whatsapp_link: string
      mensagem: string
      total_pedidos: number
      receita_total: number
      ultimo_produto: string
      ultima_compra: string
      dias_desde_ultima: number
    }

    const destinatarios: Dest[] = []
    for (const c of customers) {
      if (!c.telefone) continue
      if (search && !(c.nome || '').toLowerCase().includes(search) && !(c.email || '').toLowerCase().includes(search)) continue

      const ultimo = c.orders[0]
      const ultimoItem = ultimo?.order_items[0]
      const totalPedidos = c.orders.length
      const receitaTotal = c.orders.reduce((s, o) => s + Number(o.total || 0), 0)
      const diasDesde = ultimo ? Math.floor((hoje.getTime() - new Date(ultimo.created_at!).getTime()) / 86400000) : 999

      // Calcula cupom baseado no segmento
      let cupom = 'VOLTAI15'
      let desconto = 15
      if (segment === 'risco' || diasDesde > 30) { cupom = 'VOLTAI20'; desconto = 20 }
      if (segment === 'churn' || diasDesde > 60) { cupom = 'VOLTAI25'; desconto = 25 }
      if (segment === 'dormindo' || diasDesde > 90) { cupom = 'VOLTAI30'; desconto = 30 }
      if (receitaTotal > 1000) { cupom = 'VIPESPECIAL25'; desconto = 25 }

      // Recomendação top (último produto da marca preferida)
      const ultimoProduto = ultimoItem?.products?.nome || ''
      const ultimaMarca = ultimoItem?.products?.brands?.nome || ''

      const contexto = {
        nome: c.nome,
        ultimo_produto: ultimoProduto,
        recomendacao_top: ultimoProduto, // pode ser melhorado com recomendador
        ultima_marca: ultimaMarca,
        cupom,
        desconto,
      }

      const mensagem = tmpl.mensagem(contexto)
      const tel = c.telefone.replace(/\D/g, '')
      const whatsappLink = `https://wa.me/55${tel}?text=${encodeURIComponent(mensagem)}`

      destinatarios.push({
        id: c.id,
        nome: c.nome || 'Sem nome',
        email: c.email,
        telefone: c.telefone,
        whatsapp_link: whatsappLink,
        mensagem,
        total_pedidos: totalPedidos,
        receita_total: Number(receitaTotal.toFixed(2)),
        ultimo_produto: ultimoProduto,
        ultima_compra: ultimo?.created_at ? ultimo.created_at.toISOString() : '',
        dias_desde_ultima: diasDesde,
      })
    }

    // Ordena por receita total (clientes mais valiosos primeiro)
    destinatarios.sort((a, b) => b.receita_total - a.receita_total)

    return NextResponse.json({
      ok: true,
      template: { key: template, label: tmpl.label, emoji: tmpl.emoji },
      segment,
      total_destinatarios: destinatarios.length,
      total_com_telefone: destinatarios.length,
      destinatarios,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message, stack: err.stack }, { status: 500 })
  }
}
