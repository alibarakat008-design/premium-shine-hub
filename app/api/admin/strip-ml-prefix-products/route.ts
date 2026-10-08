/**
 * Migration: remove prefixo "ML-" dos SKUs de produtos
 * Pra alinhar com o formato salvo em order_items.sku (que é o listing_id puro)
 *
 * IMPORTANTE: só atualiza products.sku. NÃO mexe em marketplace_listings,
 * order_items.sku ou product_prices (que não tem SKU).
 *
 * GET /api/admin/strip-ml-prefix-products?secret=LUXO2026&dry=1
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || ''
  const { searchParams } = new URL(req.url)
  const secret = searchParams.get('secret')
  if (secret !== 'LUXO2026' && !authHeader.startsWith('Basic ')) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const dryRun = searchParams.get('dry') === '1'
  const t0 = Date.now()

  try {
    // 1) Encontra todos os produtos com SKU começando com "ML-"
    const matching = await prisma.products.findMany({
      where: {
        sku: { startsWith: 'ML-' },
      },
      select: {
        id: true,
        sku: true,
        nome: true,
        product_prices: { select: { canal: true, custo: true } },
      },
      take: 1000,
    })

    console.log(`[Strip ML prefix] ${matching.length} produtos com prefixo ML-`)

    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        total: matching.length,
        exemplos: matching.slice(0, 10).map((p) => ({
          id: p.id,
          sku_atual: p.sku,
          sku_novo: p.sku.replace(/^ML-/, ''),
          nome: p.nome,
        })),
      })
    }

    // 2) Atualiza um por um (pra evitar conflito de unique constraint)
    let atualizados = 0
    let conflitos = 0
    const erros: any[] = []
    for (const p of matching) {
      const novoSku = p.sku.replace(/^ML-/, '')
      try {
        // Verifica se já existe um produto com esse SKU (sem prefixo)
        const existente = await prisma.products.findFirst({
          where: { sku: novoSku, NOT: { id: p.id } },
        })
        if (existente) {
          conflitos++
          erros.push({ id: p.id, sku_atual: p.sku, sku_novo: novoSku, motivo: 'sku_ja_existe' })
          continue
        }
        await prisma.products.update({
          where: { id: p.id },
          data: { sku: novoSku },
        })
        atualizados++
      } catch (err: any) {
        erros.push({ id: p.id, sku_atual: p.sku, erro: err.message.slice(0, 100) })
      }
    }

    return NextResponse.json({
      ok: true,
      total: matching.length,
      atualizados,
      conflitos,
      duracao_ms: Date.now() - t0,
      primeiros_erros: erros.slice(0, 5),
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}