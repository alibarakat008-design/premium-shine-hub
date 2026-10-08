/**
 * =====================================================
 * API: Add Produto Rápido (serverless-safe, Prisma)
 * =====================================================
 * POST /api/admin/add-produto
 * Body: { marca_id, sku?, nome?, volume?, ean?, foto_url?,
 *         preco_venda?, custo?, notas_top?, notas_coracao?, notas_fundo? }
 *         Todos opcionais exceto marca_id.
 *         Se sku/nome vazios, gera placeholders.
 * =====================================================
 */
import { NextRequest, NextResponse } from 'next/server'
import { isMatrizRequest } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

function generateSku(): string {
  return `NOVO-${Date.now().toString(36).toUpperCase()}`
}

export async function POST(req: NextRequest) {
  if (!isMatrizRequest(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const body = await req.json()
    const { sku, nome, volume, marca_id, ean, foto_url, preco_venda, custo, notas_top, notas_coracao, notas_fundo } = body

    if (!marca_id) {
      return NextResponse.json({ ok: false, error: 'marca_id obrigatório' }, { status: 400 })
    }

    // Resolve SKU: se vazio, gera único
    let finalSku = (sku || '').trim()
    if (!finalSku) {
      finalSku = generateSku()
      for (let attempt = 0; attempt < 5; attempt++) {
        const exists = await prisma.products.findFirst({ where: { sku: finalSku }, select: { id: true } })
        if (!exists) break
        finalSku = generateSku()
      }
    } else {
      const existing = await prisma.products.findFirst({
        where: { sku: finalSku },
        select: { id: true },
      })
      if (existing) {
        return NextResponse.json({ ok: false, error: `SKU "${finalSku}" já existe` }, { status: 400 })
      }
    }

    const finalNome = (nome || '').trim() || 'NOVO PRODUTO'

    // Notas olfativas como JSON
    const hasNotas = notas_top || notas_coracao || notas_fundo
    const notasJson = hasNotas ? {
      topo: notas_top || null,
      coracao: notas_coracao || null,
      base: notas_fundo || null,
    } : undefined

    const created = await prisma.products.create({
      data: {
        sku: finalSku,
        nome: finalNome,
        volume: volume || null,
        marca_id,
        ean: ean || null,
        foto_principal_url: foto_url || null,
        ativo: true,
        notas_olfativas: notasJson ?? undefined,
      },
    })

    // product_prices
    const precoNum = preco_venda !== undefined && preco_venda !== null && preco_venda !== ''
      ? parseFloat(String(preco_venda))
      : 0
    const custoNum = custo !== undefined && custo !== null && custo !== ''
      ? parseFloat(String(custo))
      : null

    if (precoNum > 0 || custoNum !== null) {
      await prisma.product_prices.create({
        data: {
          product_id: created.id,
          canal: 'site_b2c',
          company_id: 'e2633570-74da-4b14-9ca1-ba7b0670e612',
          preco_venda: precoNum,
          custo: custoNum,
        },
      })
    }

    return NextResponse.json({
      ok: true,
      product: {
        id: created.id,
        sku: created.sku,
        nome: created.nome,
        volume: created.volume,
        ean: created.ean,
        foto_principal_url: created.foto_principal_url,
        notas_olfativas: created.notas_olfativas,
      },
    })
  } catch (err: any) {
    console.error('[add-produto]', err)
    if (err.code === 'P2002') {
      return NextResponse.json({ ok: false, error: `SKU já existe` }, { status: 400 })
    }
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
