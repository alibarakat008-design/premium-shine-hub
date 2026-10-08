/**
 * Pedidos Atrasados
 *
 * Mostra orders com status 'confirmado' há mais de X horas sem expedir
 *
 * GET /api/admin/alertas/pedidos-atrasados?horas=24&limite=50
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const horas = parseInt(searchParams.get('horas') || '24', 10)
    const limite = parseInt(searchParams.get('limite') || '50', 10)

    const dataLimite = new Date(Date.now() - horas * 3600 * 1000)

    const orders = await prisma.orders.findMany({
      where: {
        status: 'confirmado',
        created_at: { lt: dataLimite },
      },
      orderBy: { created_at: 'asc' },
      take: limite,
      select: {
        id: true,
        order_number: true,
        total: true,
        status: true,
        created_at: true,
        marketplace_accounts: {
          select: { nickname: true },
        },
        order_items: {
          select: {
            id: true,
            sku: true,
            nome_produto: true,
            quantidade: true,
          },
        },
      },
    })

    const agora = Date.now()
    const ordersFormatadas = orders.map((o) => {
      const horasAtraso = Math.floor((agora - new Date(o.created_at!).getTime()) / 3600000)
      return {
        id: o.id,
        order_number: o.order_number,
        total: Number(o.total || 0),
        status: o.status,
        created_at: o.created_at,
        horas_atraso: horasAtraso,
        conta: o.marketplace_accounts?.nickname,
        qtd_items: o.order_items?.reduce((s, i) => s + (i.quantidade || 0), 0) || 0,
        items: o.order_items || [],
      }
    })

    // Agrupa por idade
    const faixas = {
      '24-48h': ordersFormatadas.filter((o) => o.horas_atraso >= 24 && o.horas_atraso < 48).length,
      '48-72h': ordersFormatadas.filter((o) => o.horas_atraso >= 48 && o.horas_atraso < 72).length,
      '72h+': ordersFormatadas.filter((o) => o.horas_atraso >= 72).length,
    }

    return NextResponse.json({
      ok: true,
      horas_minimo: horas,
      total_atrasados: orders.length,
      faixas,
      orders: ordersFormatadas,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
