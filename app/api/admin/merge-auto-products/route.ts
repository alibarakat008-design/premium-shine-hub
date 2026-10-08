/**
 * MERGE-AUTO-PRODUCTS: mescla products AUTO-* com seus MLB-* originais
 *
 * Para cada product AUTO-*, encontra o MLB-* com mesmo nome (ou mais similar)
 * e move os order_items + product_prices + listings pra ele.
 * Deleta o AUTO- depois.
 *
 * GET /api/admin/merge-auto-products?company_id=X&dry_run=true
 * GET /api/admin/merge-auto-products?company_id=X (real)
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

const BASIC = 'Basic ' + Buffer.from('premium:shine2026').toString('base64')
const LIURA = 'e2633570-74da-4b14-9ca1-ba7b0670e612'

function normalize(s: string): string {
  return String(s || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== BASIC) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const companyId = searchParams.get('company_id') || LIURA
  const dryRun = searchParams.get('dry_run') === 'true'

  try {
    // Acha AUTO-* products da company
    const autos: any[] = await prisma.$queryRawUnsafe(`
      SELECT p.id::text as auto_id, p.sku, p.nome, COUNT(DISTINCT oi.id)::int as itens
      FROM products p
      JOIN order_items oi ON oi.product_id = p.id
      JOIN orders o ON o.id = oi.order_id
      WHERE o.company_id = $1::uuid
        AND p.sku LIKE 'AUTO-%'
      GROUP BY p.id, p.sku, p.nome
      ORDER BY itens DESC
    `, companyId)

    const t0 = Date.now()
    let mesclados = 0
    let itensMovidos = 0
    let erros = 0
    const errorSamples: string[] = []
    const mergeLog: any[] = []

    for (const auto of autos) {
      try {
        const autoId = auto.auto_id
        const autoNome = auto.nome
        const autoSku = auto.sku

        // Procura MLB-* com mesmo nome (normalizado)
        const norm = normalize(autoNome)
        const cands: any[] = await prisma.$queryRawUnsafe(`
          SELECT id::text as id, sku, nome
          FROM products
          WHERE id != $1::uuid
            AND sku LIKE 'MLB%'
            AND (
              LOWER(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(nome, '[áàâãä]', 'a', 'gi'), '[éèêë]', 'e', 'gi'), '[^a-zA-Z0-9 ]', '', 'g'))
              ILIKE $2
            )
          LIMIT 1
        `, autoId, '%' + norm.slice(0, 25) + '%')

        if (cands.length === 0) {
          // Sem candidato: renomeia AUTO- pra MLB- (mantém)
          if (!dryRun) {
            const newSku = 'AUTO' + autoSku.slice(4) // mantém como AUTO se não achar MLB
          }
          continue
        }

        const targetId = cands[0].id
        mergeLog.push({ auto_sku: autoSku, auto_nome: autoNome.slice(0, 50), target_sku: cands[0].sku, target_nome: cands[0].nome.slice(0, 50) })

        if (!dryRun) {
          // 1) Move order_items do AUTO pro MLB
          await prisma.$queryRawUnsafe(`
            UPDATE order_items SET product_id = $1::uuid
            WHERE product_id = $2::uuid
          `, targetId, autoId)
          // 2) Move/Copia product_prices
          await prisma.$queryRawUnsafe(`
            UPDATE product_prices SET product_id = $1::uuid
            WHERE product_id = $2::uuid
          `, targetId, autoId)
          // 3) Move marketplace_listings
          await prisma.$queryRawUnsafe(`
            UPDATE marketplace_listings SET product_id = $1::uuid
            WHERE product_id = $2::uuid
          `, targetId, autoId)
          // 4) Deleta o AUTO
          await prisma.$queryRawUnsafe(`DELETE FROM products WHERE id = $1::uuid`, autoId)
        }

        mesclados++
        itensMovidos += auto.itens
      } catch (e: any) {
        erros++
        if (errorSamples.length < 5) {
          errorSamples.push(`"${auto.sku}": ${e.message?.substring(0, 100)}`)
        }
      }
    }

    return NextResponse.json({
      ok: true,
      dry_run: dryRun,
      autos_encontrados: autos.length,
      mesclados,
      itens_movidos: itensMovidos,
      erros,
      erro_amostra: errorSamples,
      amostra_merges: mergeLog.slice(0, 10),
      duracao_ms: Date.now() - t0,
      mensagem: dryRun
        ? `🔍 ${autos.length} products AUTO-* encontrados. Roda sem dry_run pra mesclar.`
        : `✅ ${mesclados} products AUTO-* mesclados com MLB-*. ${itensMovidos} items movidos.`,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message, stack: err.stack?.substring(0, 800) }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}
