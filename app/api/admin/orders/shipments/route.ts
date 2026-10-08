// GET /api/admin/orders/shipments
// Retorna orders com status de envio, frete, código de rastreio
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const COMISSOES: Record<string, number> = {
  mercado_livre: 14,
  shopee: 14,
  site_b2c: 4,
  whatsapp: 0,
  b2b: 5,
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const days = Number(searchParams.get('days') || 30)
    const status = searchParams.get('status') // pendente, enviado, entregue, etc
    const onlySemRastreio = searchParams.get('sem_rastreio') === 'true'

    const from = new Date(Date.now() - days * 24 * 3600 * 1000)

    const where: any = { created_at: { gte: from } }
    if (status && status !== 'todos') where.status = status
    if (onlySemRastreio) {
      where.OR = [
        { codigo_rastreio: null },
        { codigo_rastreio: '' },
      ]
    }

    const orders = await prisma.orders.findMany({
      where,
      orderBy: { created_at: 'desc' },
      take: 200,
      include: {
        order_items: {
          include: {
            products: {
              select: { id: true, sku: true, nome: true, foto_principal_url: true },
            },
          },
        },
        marketplace_accounts: { select: { nickname: true, plataforma: true } },
      },
    })

    // Resumo
    const statusCount: Record<string, number> = {}
    let semRastreio = 0
    let comRastreio = 0
    for (const o of orders) {
      statusCount[o.status || 'pendente'] = (statusCount[o.status || 'pendente'] || 0) + 1
      if (o.codigo_rastreio) comRastreio++
      else semRastreio++
    }

    return NextResponse.json({
      ok: true,
      total: orders.length,
      sem_rastreio: semRastreio,
      com_rastreio: comRastreio,
      por_status: statusCount,
      orders: orders.map((o) => ({
        id: o.id,
        order_number: o.order_number,
        data: o.created_at,
        status: o.status,
        tracking_number: o.codigo_rastreio,
        transportadora: o.transportadora,
        previsao_entrega: o.previsao_entrega,
        data_envio: o.data_envio,
        data_entrega: o.data_entrega,
        total: Number(o.total || 0),
        conta: (o.marketplace_accounts as any)?.nickname,
        plataforma: (o.marketplace_accounts as any)?.plataforma,
        itens: o.order_items?.map((it) => ({
          id: it.id,
          sku: it.products?.sku,
          nome: it.products?.nome || it.nome_produto,
          foto: it.products?.foto_principal_url,
          quantidade: it.quantidade,
          preco_total: Number(it.preco_total),
        })) || [],
        itens_count: o.order_items?.reduce((s, i) => s + (i.quantidade || 0), 0) || 0,
      })),
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
