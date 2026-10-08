import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const BASIC = 'Basic ' + Buffer.from('premium:shine2026').toString('base64')

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
  const companyId = req.nextUrl.searchParams.get('company_id') || 'e2633570-74da-4b14-9ca1-ba7b0670e612'
  try {
    const autos: any[] = await prisma.$queryRawUnsafe(`
      SELECT p.id::text as auto_id, p.sku, p.nome, COUNT(DISTINCT oi.id)::int as itens
      FROM products p
      JOIN order_items oi ON oi.product_id = p.id
      JOIN orders o ON o.id = oi.order_id
      WHERE o.company_id = $1::uuid AND p.sku LIKE 'AUTO-%'
      GROUP BY p.id, p.sku, p.nome
      ORDER BY itens DESC
    `, companyId)

    const results: any[] = []
    for (const auto of autos) {
      const norm = normalize(auto.nome)
      const words = norm.split(' ').filter(w => w.length >= 5).slice(0, 4)
      // Tenta achar MLB-* que contenha 2+ das palavras
      const cands: any[] = await prisma.$queryRawUnsafe(`
        SELECT id::text as id, sku, nome
        FROM products
        WHERE id != $1::uuid AND sku LIKE 'MLB%' AND (
          ${words.map((_, i) => `(LOWER(nome) ILIKE $${i + 2})`).join(' OR ')}
        )
        LIMIT 5
      `, auto.auto_id, ...words.map(w => '%' + w + '%'))
      results.push({
        auto_sku: auto.sku,
        auto_nome: auto.nome,
        itens: auto.itens,
        candidatos: cands.map((c: any) => ({ sku: c.sku, nome: c.nome }))
      })
    }
    return NextResponse.json({ ok: true, count: results.length, items: results.slice(0, 20) })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message })
  } finally {
    await prisma.$disconnect()
  }
}
