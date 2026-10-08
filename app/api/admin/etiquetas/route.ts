/**
 * Lista pedidos para impressão de etiquetas
 *
 * - status: confirmado, separado, enviado (default: confirmado)
 * - plataforma: mercado_livre, shopee (default: all)
 * - envio_full: true|false (default: all)
 * - data_inicio / data_fim: ISO date (default: hoje)
 * - limit: max pedidos (default 200)
 *
 * Retorna pedidos com seus items (sku, titulo, quantidade, preco)
 * Pra cada item gera 1 etiqueta (qtd 2 = 2 etiquetas)
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status') || 'confirmado'
    const plataforma = searchParams.get('plataforma')
    const envioFull = searchParams.get('envio_full')
    const dataInicio = searchParams.get('data_inicio')
    const dataFim = searchParams.get('data_fim')
    const limit = parseInt(searchParams.get('limit') || '200', 10)
    const jaImpresso = searchParams.get('ja_impresso') // 'sim' | 'nao' | null (all)

    const where: any = {}

    // Status — 'todos' = tudo menos cancelado/devolvido
    if (status === 'todos') {
      where.status = { notIn: ['cancelado', 'devolvido'] }
    } else if (status && status !== 'all') {
      where.status = Array.isArray(status) ? { in: status.split(',') } : status
    }

    // Filtro de data — se vier, usa created_at; senão últimos 30 dias (aumentado de 7 pra pegar mais)
    if (dataInicio || dataFim) {
      where.created_at = {}
      if (dataInicio) where.created_at.gte = new Date(dataInicio + 'T00:00:00')
      if (dataFim) where.created_at.lte = new Date(dataFim + 'T23:59:59')
    } else {
      const d30 = new Date(Date.now() - 30 * 24 * 3600 * 1000)
      where.created_at = { gte: d30 }
    }

    if (jaImpresso === 'nao') where.etiqueta_impressa = { not: true }
    if (jaImpresso === 'sim') where.etiqueta_impressa = true

    const orders = await prisma.orders.findMany({
      where,
      orderBy: { created_at: 'desc' },
      take: limit,
      select: {
        id: true,
        order_number: true,
        total: true,
        status: true,
        origem: true,
        etiqueta_impressa: true,
        etiqueta_impressa_em: true,
        created_at: true,
        marketplace_accounts: {
          select: { plataforma: true, nickname: true },
        },
        order_items: {
          select: {
            id: true,
            sku: true,
            nome_produto: true,
            quantidade: true,
            preco_unitario: true,
            products: {
              select: {
                id: true,
                sku: true,
                nome: true,
                brands: { select: { nome: true } },
              },
            },
          },
        },
      },
    })

    // Filtrar por plataforma se necessário (depois da query pq é via JOIN)
    let filtered = orders
    if (plataforma) {
      filtered = filtered.filter((o) => o.marketplace_accounts?.plataforma === plataforma)
    }

    // Formata pra retorno: cada pedido vira { pedido, etiquetas: [{sku, titulo, qtd, ordem, marca}] }
    const result = filtered.map((o) => {
      const etiquetas: Array<{
        sku: string
        titulo: string
        quantidade: number
        preco_unitario: number
        marca: string
        order_id: string
        order_number: string
        item_id: string
      }> = []

      for (const it of o.order_items || []) {
        const sku = it.sku || it.products?.sku || 'SEM-SKU'
        const titulo = it.nome_produto || it.products?.nome || 'Sem título'
        const marca = it.products?.brands?.nome || ''
        const qtd = it.quantidade || 1
        // Cria 1 entrada por unidade (pra imprimir 1 etiqueta por unidade)
        for (let i = 0; i < qtd; i++) {
          etiquetas.push({
            sku,
            titulo,
            quantidade: qtd,
            preco_unitario: Number(it.preco_unitario || 0),
            marca,
            order_id: o.id,
            order_number: o.order_number || `ID-${o.id.slice(0, 8)}`,
            item_id: it.id,
          })
        }
      }

      return {
        id: o.id,
        order_number: o.order_number,
        total: Number(o.total || 0),
        status: o.status,
        origem: o.origem,
        plataforma: o.marketplace_accounts?.plataforma,
        conta: o.marketplace_accounts?.nickname,
        envio_full: false, // TODO: detectar via marketplace_listings (não está em orders)
        etiqueta_impressa: o.etiqueta_impressa,
        etiqueta_impressa_em: o.etiqueta_impressa_em,
        created_at: o.created_at,
        total_etiquetas: etiquetas.length,
        etiquetas,
      }
    })

    return NextResponse.json({
      ok: true,
      total_pedidos: result.length,
      total_etiquetas: result.reduce((s, p) => s + p.total_etiquetas, 0),
      pedidos: result,
    })
  } catch (err: any) {
    console.error('[API ETIQUETAS]', err)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
