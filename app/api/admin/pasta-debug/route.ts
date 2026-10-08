import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isMatrizRequest } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const ISABELLE_ID = 'a897a8d7-d0e4-4de0-bb0f-3f89b364e8b5'

export async function POST(req: NextRequest) {
  if (!isMatrizRequest(req)) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  try {
    // Step 1: Get or create PASTA category
    let pastaCat = await prisma.categories.findUnique({ where: { slug: 'pasta-dental' } })
    if (!pastaCat) {
      pastaCat = await prisma.categories.create({
        data: { nome: 'PASTA DENTAL', slug: 'pasta-dental', ativa: true, ordem: 15 }
      })
    }

    // Step 2: Count ISABELLE products
    const totalCount = await prisma.products.count({
      where: { marca_id: ISABELLE_ID }
    })
    const activeCount = await prisma.products.count({
      where: { marca_id: ISABELLE_ID, ativo: true }
    })

    // Step 3: Test a simple contains query
    const testProducts = await prisma.products.findMany({
      where: {
        marca_id: ISABELLE_ID,
        ativo: true,
        nome: { contains: 'PASTA' }
      },
      select: { id: true, nome: true },
      take: 5
    })

    // Step 4: Test deactivation
    const deactivateOld = await prisma.products.updateMany({
      where: {
        marca_id: ISABELLE_ID,
        ativo: true,
        nome: { contains: 'Creme Hidratante' }
      },
      data: { ativo: false }
    })

    // Step 5: Test a rename
    const renameResult = await prisma.products.updateMany({
      where: {
        marca_id: ISABELLE_ID,
        ativo: true,
        nome: { contains: 'PASTA AFEEF' }
      },
      data: {
        nome: 'PASTA AFEEF 200GR',
        sku: 'ILB-PASTA-AFEEF-200GR',
        ean: '7898744785481',
        categoria_id: pastaCat.id
      }
    })

    // Step 6: Test create
    const existingSku = await prisma.products.findUnique({ where: { sku: 'ILB-PASTA-VENENO-BIANCO-200GR' } })
    let created = null
    if (!existingSku) {
      created = await prisma.products.create({
        data: {
          nome: 'PASTA VENENO BIANCO 200GR',
          sku: 'ILB-PASTA-VENENO-BIANCO-200GR',
          ean: '7898286336578',
          marca_id: ISABELLE_ID,
          categoria_id: pastaCat.id,
          ativo: true,
          publicado_site: false,
          publicado_shopee: false,
        }
      })
    }

    // Step 7: Count pasta products
    const pastaCount = await prisma.products.count({
      where: { marca_id: ISABELLE_ID, ativo: true, categoria_id: pastaCat.id }
    })

    return NextResponse.json({
      pastaCat,
      totalCount,
      activeCount,
      testProducts,
      deactivateOld,
      renameResult,
      created: created ? { id: created.id, nome: created.nome } : 'already existed',
      pastaCount
    })
  } catch (err: unknown) {
    const e = err as Error
    return NextResponse.json({ error: e.message, stack: e.stack }, { status: 500 })
  }
}
