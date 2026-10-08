/**
 * Fix packs items - backfill items sintéticos pra packs onde a venda
 * principal (com items) tem mais items que as secundárias.
 *
 * Estratégia:
 *  1. Acha cada pack
 *  2. Encontra a "venda modelo" (a com mais items, geralmente a primeira)
 *  3. Pra cada venda secundária SEM items, copia os items da venda modelo
 *     mas com preco_unitario e custo_unitario proporcionais ao peso da venda
 *     secundaria no pack
 *
 * Idempotente: só adiciona items onde não tem.
 *
 * GET /api/admin/fix-packs-items?days=120&maxPacks=1000
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET(req: NextRequest) {
  const t0 = Date.now()
  try {
    const { searchParams } = new URL(req.url)
    const days = Math.max(1, Number(searchParams.get('days') || 120))
    const maxPacks = Math.min(Number(searchParams.get('maxPacks') || 1000), 5000)

    // 1) Acha packs com > 1 venda onde pelo menos uma venda tem items
    // IMPORTANTE: pack_id é VARCHAR (não UUID) — ML usa IDs numéricos
    const packs: any[] = await prisma.$queryRawUnsafe(`
      WITH pack_stats AS (
        SELECT
          o.pack_id as pack_id,
          COUNT(DISTINCT o.id)::int as qtd_vendas,
          COUNT(DISTINCT oi.id)::int as qtd_items_total
        FROM orders o
        LEFT JOIN order_items oi ON oi.order_id = o.id
        WHERE o.pack_id IS NOT NULL
          AND o.status NOT IN ('cancelado', 'devolvido')
          AND o.created_at > NOW() - (INTERVAL '${days} days')
        GROUP BY o.pack_id
        HAVING COUNT(DISTINCT o.id) > 1
          AND COUNT(DISTINCT oi.id) > 0
      )
      SELECT pack_id, qtd_vendas, qtd_items_total
      FROM pack_stats
      ORDER BY qtd_vendas DESC
      LIMIT ${maxPacks}
    `)

    if (packs.length === 0) {
      return NextResponse.json({ ok: true, message: 'Nenhum pack pra processar', packs_processados: 0 })
    }

    let packsProcessados = 0
    let itemsCopiados = 0
    let vendasAtualizadas = 0
    const samples: any[] = []

    for (const pack of packs) {
      try {
        // 2) Pega todas as vendas do pack com contagem de items
        // IMPORTANTE: pack_id é VARCHAR, não UUID
        const vendasPack: any[] = await prisma.$queryRawUnsafe(`
          SELECT
            o.id::text as id,
            o.total::text as total,
            o.custo_total::text as custo_total,
            o.created_at,
            (SELECT COUNT(*)::int FROM order_items WHERE order_id = o.id) as items_count
          FROM orders o
          WHERE o.pack_id = '${pack.pack_id.replace(/'/g, "''")}'
            AND o.status NOT IN ('cancelado', 'devolvido')
          ORDER BY o.created_at ASC
        `)

        // 3) Encontra venda "modelo" = a com mais items (se empate, a primeira)
        const vendaModelo = vendasPack.reduce((best, v) =>
          !best || v.items_count > best.items_count ? v : best
        , null as any)
        if (!vendaModelo || vendaModelo.items_count === 0) continue

        // 4) Pega items da venda modelo
        const itemsModelo: any[] = await prisma.$queryRawUnsafe(`
          SELECT
            sku, nome_produto, foto_url, quantidade,
            preco_unitario::text as preco_unitario,
            custo_unitario::text as custo_unitario
          FROM order_items
          WHERE order_id = '${vendaModelo.id.replace(/'/g, "''")}'::uuid
          ORDER BY id ASC
        `)
        if (itemsModelo.length === 0) continue

        // 5) Calcula receita total do pack
        const receitaPack = vendasPack.reduce((s, v) => s + Number(v.total), 0)
        if (receitaPack <= 0) continue

        // 6) Pra cada venda secundária SEM items, COPIA items proporcionalmente
        for (const v of vendasPack) {
          if (v.id === vendaModelo.id) continue
          if (v.items_count > 0) continue // ja tem items, nao mexe

          const proporcao = Number(v.total) / receitaPack

          for (const it of itemsModelo) {
            const custoItem = Number(it.custo_unitario || 0) * proporcao
            const precoItem = Number(it.preco_unitario || 0) * proporcao

            await prisma.order_items.create({
              data: {
                order_id: v.id,
                product_id: null, // sem link, e item sintetico do pack
                sku: String(it.sku || '').substring(0, 200),
                nome_produto: String(it.nome_produto || '').substring(0, 500),
                foto_url: it.foto_url ? String(it.foto_url).substring(0, 1000) : null,
                quantidade: 1,
                preco_unitario: precoItem,
                preco_total: Number(v.total),
                custo_unitario: custoItem,
              } as any,
            })
            itemsCopiados++
          }

          // Atualiza custo_total da venda
          const novoCusto = itemsModelo.reduce(
            (s, it) => s + Number(it.custo_unitario || 0) * proporcao,
            0
          )
          await prisma.$executeRawUnsafe(
            `UPDATE orders SET custo_total = ${novoCusto.toFixed(2)} WHERE id = '${v.id.replace(/'/g, "''")}'::uuid`
          )
          vendasAtualizadas++

          if (samples.length < 10) {
            samples.push({
              pack_id: pack.pack_id.substring(0, 8),
              venda_secundaria: v.id.substring(0, 8),
              venda_principal: vendaModelo.id.substring(0, 8),
              itens_criados: itemsModelo.length,
              proporcao: (proporcao * 100).toFixed(1) + '%',
              custo_total: novoCusto.toFixed(2),
            })
          }
        }
        packsProcessados++
      } catch (e: any) {
        // skip
      }
    }

    return NextResponse.json({
      ok: true,
      packs_encontrados: packs.length,
      packs_processados: packsProcessados,
      items_copiados: itemsCopiados,
      vendas_atualizadas: vendasAtualizadas,
      samples,
      duracao_ms: Date.now() - t0,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message, stack: err.stack }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  return GET(req)
}
