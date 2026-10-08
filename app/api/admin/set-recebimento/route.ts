import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const orderId = body.order || body.order_id || body.pack_id
    const recebimento = Number(body.recebimento)
    if (!orderId || isNaN(recebimento)) {
      return NextResponse.json({ ok: false, error: 'order + recebimento required' }, { status: 400 })
    }

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId)
    const o = await prisma.orders.findFirst({
      where: {
        OR: [
          ...(isUuid ? [{ id: orderId }] : []),
          { order_number: orderId },
          { pack_id: orderId },
        ],
      },
    })
    if (!o) return NextResponse.json({ ok: false, error: 'order not found' }, { status: 404 })

    // Se for pack_id (não UUID nem order_number específico), atualiza TODOS os orders do pack
    const isPackQuery = (orderId === o.pack_id && orderId !== o.order_number)

    const dec = (d: any) => (d ? Number(d.toString()) : 0)
    const oldRec = dec(o.recebimento_liquido)

    await prisma.orders.update({
      where: { id: o.id },
      data: { recebimento_liquido: recebimento },
    })

    let updatedCount = 1
    const updates: any[] = [{
      order_number: o.order_number,
      recebimento_anterior: oldRec,
      recebimento_novo: recebimento,
    }]

    if (isPackQuery && o.pack_id) {
      // Achar TODAS as vendas do pack, calcular proporção de cada uma e atualizar
      const allPack = await prisma.orders.findMany({
        where: { pack_id: o.pack_id },
      })
      const totalVendas = allPack.reduce((s, p) => s + dec(p.total), 0)
      // Para distribuição correta: TODAS as vendas devem ser atualizadas proporcionalmente
      // (a primeira venda teve o valor cheio inicialmente — agora rebalanceamos)
      const newUpdates: any[] = []
      for (const p of allPack) {
        const proporcao = dec(p.total) / totalVendas
        const recParcial = Number((recebimento * proporcao).toFixed(2))
        await prisma.orders.update({
          where: { id: p.id },
          data: { recebimento_liquido: recParcial },
        })
        newUpdates.push({
          order_number: p.order_number,
          proporcao: Number((proporcao * 100).toFixed(1)) + '%',
          recebimento_novo: recParcial,
        })
      }
      updatedCount = newUpdates.length
      // Substitui: remove updates antiga, adiciona nova distribuição
      updates.length = 0
      updates.push(...newUpdates)
    }

    return NextResponse.json({
      ok: true,
      total_atualizadas: updatedCount,
      updates,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}