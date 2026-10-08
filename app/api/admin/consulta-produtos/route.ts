// /api/admin/consulta-produtos
// Consulta produtos das marcas com misclassificação
// GET ?marcas=1 - lista ASDAAF, AL WATANIAH, LATTAFA
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const TARGET_BRANDS = [
  '038de3b5-24c9-4c9a-adc4-387618ffaf3b', // ASDAAF
  '112c6283-5f6f-4e62-b42c-38e1fc16ef38', // AL WATANIAH
  '9c38b605-dd08-46ff-b7f8-886174e47ba2', // LATTAFA
  '693d1159-9ce2-442f-a527-381dbbbf302c', // ARMAF
  'eb4147fd-91c0-469a-915a-97583042832f', // ARD AL ZAAFARAN
  'a5f1e2c3-4d5b-4e6f-a7b8-c9d0e1f2a3b4', // MPF
  'ccc3a88c-ad4e-451f-a55c-bdb7362dd8c7', // MAISON ALHAMBRA
  '4509732a-d983-47e5-a235-2339154c70c8', // RAYHAAN
  'c7f3a4e5-6f7d-6a8b-9c0d-e1f2a3b4c5d6', // ZIMAYA
]

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const marcas = searchParams.get('marcas')

    const products = await prisma.products.findMany({
      where: marcas === '1' ? { marca_id: { in: TARGET_BRANDS } } : {},
      select: {
        id: true,
        sku: true,
        nome: true,
        marca_id: true,
        brands: { select: { id: true, nome: true } },
      },
      orderBy: [{ brands: { nome: 'asc' } }, { nome: 'asc' }],
    })

    const byBrand: Record<string, any[]> = {}
    for (const p of products) {
      const bname = p.brands?.nome || 'NO_BRAND'
      if (!byBrand[bname]) byBrand[bname] = []
      byBrand[bname].push({ id: p.id, sku: p.sku, nome: p.nome })
    }

    return NextResponse.json({ ok: true, total: products.length, byBrand })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
