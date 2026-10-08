/**
 * POST /api/admin/orders/set-fulfillment
 *
 * Marca a etapa de fulfillment manual de uma venda.
 *
 * Body: { order_id: string, etapa: 'imprimir' | 'embalar' | 'desfazer' }
 *
 * Etapas:
 *   - 'imprimir'  → marca etiqueta_impressa_em = NOW() (e status='separado' se ainda não tiver)
 *   - 'embalar'   → marca embalado_em = NOW() (se etiqueta não foi impressa, marca também)
 *   - 'desfazer'  → zera etiqueta_impressa_em + embalado_em (volta pro início do fluxo interno)
 *
 * Status ML (enviado/entregue/cancelado) é controlado pelo backfill-status automaticamente.
 *
 * Cores:
 *   ⚪ Pendente   → sem etiqueta impressa
 *   🟡 Impresso   → etiqueta_impressa_em != null && embalado_em == null
 *   🟢 Embalado   → embalado_em != null
 *   🔵 Postado    → orders.status = 'enviado' (auto via ML backfill)
 *   🟣 Entregue   → orders.status = 'entregue' (auto)
 *   🔴 Cancelado  → orders.status = 'cancelado'/'devolvido' (auto ou manual)
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { order_id, etapa } = body

    if (!order_id) {
      return NextResponse.json({ ok: false, error: 'order_id obrigatório' }, { status: 400 })
    }
    if (!['imprimir', 'embalar', 'desfazer'].includes(etapa)) {
      return NextResponse.json({
        ok: false,
        error: 'etapa deve ser: "imprimir" | "embalar" | "desfazer"',
      }, { status: 400 })
    }

    // Usa SQL puro pra incluir as colunas novas (Prisma ainda não conhece)
    const orderRes: any[] = await prisma.$queryRawUnsafe(`
      SELECT id::text, order_number, status::text,
             etiqueta_impressa_em, embalado_em
      FROM orders WHERE id = $1::uuid LIMIT 1
    `, order_id)
    if (orderRes.length === 0) {
      return NextResponse.json({ ok: false, error: 'Venda não encontrada' }, { status: 404 })
    }
    const order = orderRes[0]

    let updates: any = {}
    let message = ''

    if (etapa === 'imprimir') {
      updates.etiqueta_impressa_em = new Date()
      // Avança o status interno se ainda tá em 'confirmado'
      if (order.status === 'confirmado' || order.status === 'pendente') {
        updates.status = 'separado'
      }
      message = `✅ Etiqueta impressa (${order.order_number})`
    } else if (etapa === 'embalar') {
      updates.embalado_em = new Date()
      // Se não marcou impressão antes, marca agora também
      if (!order.etiqueta_impressa_em) {
        updates.etiqueta_impressa_em = new Date()
      }
      // Avança status se ainda tá em 'confirmado'/'separado'
      if (['confirmado', 'pendente', 'separado'].includes(order.status)) {
        updates.status = 'separado'
      }
      message = `✅ Embalado (${order.order_number})`
    } else if (etapa === 'desfazer') {
      updates.etiqueta_impressa_em = null
      updates.embalado_em = null
      message = `↩️ Etapas internas zeradas (${order.order_number})`
    }

    await prisma.orders.update({
      where: { id: order_id },
      data: updates,
    })

    return NextResponse.json({
      ok: true,
      message,
      order_number: order.order_number,
      etapa_aplicada: etapa,
      updates,
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}