// GET /api/admin/relatorios/carrinho-abandonado
// Lista orders com status 'pendente' (não finalizadas/pagas)
// Identifica clientes que adicionaram produtos mas não converteram
// - Faixa de tempo: 1h a 7 dias (ainda dá pra recuperar)
// - Ordena por valor (alto → baixo)
// - Mostra potencial de receita perdida

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const minHoras = Number(searchParams.get('min_horas') || 1)
    const maxDias = Number(searchParams.get('max_dias') || 7)
    const limit = Math.min(Number(searchParams.get('limit') || 100), 500)

    const agora = new Date()
    const minDate = new Date(agora.getTime() - maxDias * 86400000)
    const maxDate = new Date(agora.getTime() - minHoras * 3600000)

    const orders = await prisma.orders.findMany({
      where: {
        status: 'pendente',
        created_at: { gte: minDate, lte: maxDate },
      },
      orderBy: { total: 'desc' },
      take: limit,
      include: {
        customers: { select: { id: true, nome: true, email: true, telefone: true } },
        order_items: {
          include: {
            products: { select: { sku: true, nome: true, brands: { select: { nome: true } }, foto_principal_url: true } },
          },
        },
        marketplace_accounts: { select: { nickname: true, plataforma: true } },
      },
    })

    type Carrinho = {
      id: string
      order_number: string
      cliente_id: string
      cliente_nome: string
      cliente_email: string | null
      cliente_telefone: string | null
      total: number
      itens: number
      unidades: number
      criado_em: string
      horas_desde: number
      conta: string
      plataforma: string
      produtos: { sku: string; nome: string; marca: string; foto: string | null; quantidade: number; preco: number }[]
      tem_telefone: boolean
    }

    const carrinhos: Carrinho[] = orders.map((o) => ({
      id: o.id,
      order_number: o.order_number || '',
      cliente_id: o.customers?.id || '',
      cliente_nome: o.customers?.nome || 'Visitante',
      cliente_email: o.customers?.email || null,
      cliente_telefone: o.customers?.telefone || null,
      total: Number(o.total || 0),
      itens: o.order_items.length,
      unidades: o.order_items.reduce((s, i) => s + i.quantidade, 0),
      criado_em: o.created_at?.toISOString() || '',
      horas_desde: Math.floor((agora.getTime() - new Date(o.created_at!).getTime()) / 3600000),
      conta: o.marketplace_accounts?.nickname || '',
      plataforma: o.marketplace_accounts?.plataforma || '',
      produtos: o.order_items.map((i) => ({
        sku: i.products?.sku || '',
        nome: i.products?.nome || i.nome_produto,
        marca: i.products?.brands?.nome || '',
        foto: i.products?.foto_principal_url || null,
        quantidade: i.quantidade,
        preco: Number(i.preco_unitario || i.preco_total || 0),
      })),
      tem_telefone: !!o.customers?.telefone,
    }))

    const totalValor = carrinhos.reduce((s, c) => s + c.total, 0)
    const totalUnidades = carrinhos.reduce((s, c) => s + c.unidades, 0)
    const comTelefone = carrinhos.filter((c) => c.tem_telefone).length
    const valorRecuperavel = carrinhos.filter((c) => c.tem_telefone).reduce((s, c) => s + c.total, 0)

    // Por urgência
    const porUrgencia: Record<string, { count: number; valor: number }> = {
      '1-6h': { count: 0, valor: 0 },
      '6-24h': { count: 0, valor: 0 },
      '1-3d': { count: 0, valor: 0 },
      '3-7d': { count: 0, valor: 0 },
    }
    for (const c of carrinhos) {
      if (c.horas_desde < 6) { porUrgencia['1-6h'].count++; porUrgencia['1-6h'].valor += c.total }
      else if (c.horas_desde < 24) { porUrgencia['6-24h'].count++; porUrgencia['6-24h'].valor += c.total }
      else if (c.horas_desde < 72) { porUrgencia['1-3d'].count++; porUrgencia['1-3d'].valor += c.total }
      else { porUrgencia['3-7d'].count++; porUrgencia['3-7d'].valor += c.total }
    }

    const insights: any[] = []
    if (comTelefone > 0) {
      insights.push({
        emoji: '💬',
        tipo: 'positivo',
        titulo: `${comTelefone} carrinhos com telefone disponível`,
        detalhe: `Valor recuperável: R$ ${valorRecuperavel.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}. Mande WhatsApp agora!`,
      })
    }
    if (carrinhos.length > 0) {
      const alto = carrinhos.filter((c) => c.total > 200)
      if (alto.length > 0) {
        insights.push({
          emoji: '💎',
          tipo: 'atencao',
          titulo: `${alto.length} carrinhos de ALTO valor (>R$200)`,
          detalhe: `Total: R$ ${alto.reduce((s, c) => s + c.total, 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}. Priorize esses!`,
        })
      }
    }
    if (carrinhos.length === 0) {
      insights.push({
        emoji: '✅',
        tipo: 'positivo',
        titulo: 'Nenhum carrinho abandonado no momento',
        detalhe: 'Todos os clientes finalizaram a compra ou abandonaram há mais de 7 dias.',
      })
    }

    return NextResponse.json({
      ok: true,
      total_carrinhos: carrinhos.length,
      total_unidades: totalUnidades,
      valor_total: Number(totalValor.toFixed(2)),
      valor_recuperavel: Number(valorRecuperavel.toFixed(2)),
      com_telefone: comTelefone,
      por_urgencia: porUrgencia,
      carrinhos,
      insights,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message, stack: err.stack }, { status: 500 })
  }
}
