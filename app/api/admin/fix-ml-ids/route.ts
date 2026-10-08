/**
 * POST /api/admin/fix-ml-ids
 * Corrige ML IDs corrompidos (URLs completas ao invés de IDs)
 *
 * Reescrito em 2026-09-01: usava um Personal Access Token do Supabase gravado
 * direto no código (mesmo token exposto em outros 4 arquivos — já removido de
 * todos, recomendado revogar no painel do Supabase e gerar um novo) e montava
 * SQL colando valores direto na string (injeção de SQL). Agora usa Prisma com
 * valores sempre parametrizados. products.ml_ids não está declarado no
 * schema.prisma (drift de schema), por isso segue via $queryRaw/$executeRaw,
 * mas com Prisma.sql — nunca concatenando string.
 */
import { NextRequest, NextResponse } from 'next/server'
import { isMatrizRequest } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export const dynamic = 'force-dynamic'

// Extrai MLB/MLBU de URL completa do ML
function extractMlId(value: string): string | null {
  if (!value) return null
  if (/^(MLB|MLBU)\d+$/i.test(value.trim())) {
    return value.trim().toUpperCase()
  }
  const match = value.match(/(MLB|MLBU)\d+/i)
  return match ? match[0].toUpperCase() : null
}

export async function POST(req: NextRequest) {
  if (!isMatrizRequest(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { product_id, dry_run } = await req.json()

    if (product_id) {
      // Corrige um produto específico
      const rows = await prisma.$queryRaw<{ id: string; nome: string; ml_ids: any }[]>`
        SELECT id, nome, ml_ids FROM products WHERE id = ${product_id}::uuid
      `
      const product = rows[0]
      if (!product) return NextResponse.json({ ok: false, error: 'Produto não encontrado' }, { status: 404 })

      let mlIds: any[] = product.ml_ids || []
      if (typeof product.ml_ids === 'string') {
        try { mlIds = JSON.parse(product.ml_ids) } catch { /* not JSON */ }
      }

      if (!Array.isArray(mlIds) || mlIds.length === 0) {
        return NextResponse.json({ ok: true, fixed: 0, message: 'Sem ML IDs para corrigir' })
      }

      const fixedIds = mlIds.map((v: string) => extractMlId(v)).filter(Boolean) as string[]
      const uniqueIds = [...new Set(fixedIds)]

      if (dry_run) {
        return NextResponse.json({
          ok: true,
          original: mlIds,
          extracted: uniqueIds,
          message: 'Dry run — nada foi alterado',
        })
      }

      const idsJson = JSON.stringify(uniqueIds)
      await prisma.$executeRaw`
        UPDATE products SET ml_ids = ${idsJson}, updated_at = NOW() WHERE id = ${product_id}::uuid
      `

      return NextResponse.json({
        ok: true,
        fixed: uniqueIds.length,
        original: mlIds,
        corrected: uniqueIds,
      })
    } else {
      // Corrige TODOS os produtos com ML IDs corrompidos
      const rows = await prisma.$queryRaw<{ id: string; nome: string; ml_ids: any }[]>`
        SELECT id, nome, ml_ids FROM products WHERE ml_ids IS NOT NULL AND ml_ids != ''
      `
      const toFix: { id: string; nome: string; original: string[]; corrected: string[] }[] = []

      for (const p of rows) {
        let mlIds = p.ml_ids || []
        if (typeof mlIds === 'string') {
          try { mlIds = JSON.parse(mlIds) } catch { continue }
        }
        if (!Array.isArray(mlIds)) continue

        const fixed = mlIds.map((v: string) => extractMlId(v)).filter(Boolean) as string[]
        const unique = [...new Set(fixed)]

        const needsFix = mlIds.some((v: string) => {
          const clean = extractMlId(v)
          return !clean || clean !== v.trim().toUpperCase()
        })

        if (needsFix && unique.length > 0) {
          toFix.push({ id: p.id, nome: p.nome, original: mlIds, corrected: unique })
        }
      }

      if (dry_run) {
        return NextResponse.json({ ok: true, dry_run: true, to_fix: toFix })
      }

      let fixed = 0
      for (const p of toFix) {
        const idsJson = JSON.stringify(p.corrected)
        await prisma.$executeRaw`
          UPDATE products SET ml_ids = ${idsJson}, updated_at = NOW() WHERE id = ${p.id}::uuid
        `
        fixed++
      }

      return NextResponse.json({ ok: true, total_fixed: fixed, products: toFix })
    }
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}
