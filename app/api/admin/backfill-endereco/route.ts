// POST /api/admin/backfill-endereco
// Busca no ML o receiver_address de orders que ainda não têm endereco_entrega
// Roda em chunks, retorna progresso pra próximo batch
// Uso: POST /api/admin/backfill-endereco?from=YYYY-MM-DD&to=YYYY-MM-DD&batch=50&offset=0
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const batchSize = Math.min(Number(searchParams.get('batch') || 30), 50)
    const offset = Number(searchParams.get('offset') || 0)
    const from = searchParams.get('from')
    const to = searchParams.get('to')

    const where: any = {
      OR: [
        { endereco_entrega: { equals: null } },
      ],
    }
    if (from || to) {
      where.created_at = {}
      if (from) where.created_at.gte = new Date(from)
      if (to) where.created_at.lte = new Date(to + 'T23:59:59')
    }

    const totalSemEndereco = await prisma.orders.count({ where })

    const orders = await prisma.orders.findMany({
      where,
      select: { id: true, order_number: true },
      orderBy: { created_at: 'asc' },
      take: batchSize,
      skip: offset,
    })

    if (orders.length === 0) {
      return NextResponse.json({ ok: true, status: 'concluido', processadas: 0, restantes: 0, total_sem_endereco: totalSemEndereco })
    }

    const account = await prisma.marketplace_accounts.findFirst({
      where: { nickname: 'LIURAESSENCE' },
    })
    if (!account?.access_token) {
      return NextResponse.json({ ok: false, error: 'Conta ML sem token' }, { status: 500 })
    }

    let extraidos = 0
    let erros = 0

    // Processa em paralelo (5 por vez pra não estourar rate limit)
    const CHUNK = 5
    for (let i = 0; i < orders.length; i += CHUNK) {
      const slice = orders.slice(i, i + CHUNK)
      await Promise.all(slice.map(async (o) => {
        try {
          const r = await fetch(`https://api.mercadolibre.com/orders/${o.order_number}`, {
            headers: { Authorization: `Bearer ${account.access_token}` },
          })
          if (!r.ok) { erros++; return }
          const detail = await r.json()
          const addr = detail.receiver_address
          if (addr && (addr.state?.id || addr.city?.name)) {
            await prisma.orders.update({
              where: { id: o.id },
              data: {
                endereco_entrega: {
                  uf: addr.state?.id || null,
                  estado: addr.state?.name || null,
                  cidade: addr.city?.name || null,
                  bairro: addr.neighborhood?.name || null,
                  cep: addr.zip_code || null,
                  rua: addr.street_name || null,
                  numero: addr.street_number || null,
                  complemento: addr.comment || null,
                  lat: addr.latitude || null,
                  lng: addr.longitude || null,
                },
              },
            })
            extraidos++
          } else {
            erros++ // sem endereço retornado
          }
        } catch {
          erros++
        }
      }))
    }

    const restantes = totalSemEndereco - offset - extraidos
    return NextResponse.json({
      ok: true,
      status: restantes > 0 ? 'continua' : 'concluido',
      processadas: orders.length,
      extraidos,
      erros,
      restantes: Math.max(0, restantes),
      total_sem_endereco: totalSemEndereco,
      next_offset: offset + batchSize,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
